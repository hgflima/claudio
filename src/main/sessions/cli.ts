// Claude Code CLI sessions in ~/.claude/projects/*/*.jsonl: listing + conversion to TranscriptItems.
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline'
import type { TranscriptItem } from '@shared/ipc'
import { toolResultText } from './normalize'
import type { StoredItem } from './persist'

export interface CliSessionFile { id: string; file: string; mtimeMs: number }
export interface CliSessionSummary { cwd: string; title: string; messageCount: number; lastActivityAt: number }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const projectsDir = () => join(homedir(), '.claude', 'projects')

type Line = { type?: string; [k: string]: unknown }
type Block = { type: string; [k: string]: unknown }
const s = (v: unknown): string => (typeof v === 'string' ? v : '')

export function listCliSessionFiles(): CliSessionFile[] {
  const root = projectsDir()
  if (!existsSync(root)) return []
  const out: CliSessionFile[] = []
  for (const proj of readdirSync(root)) {
    const dir = join(root, proj)
    let entries: string[]
    try { entries = readdirSync(dir) } catch { continue }
    for (const f of entries) {
      const id = basename(f, '.jsonl')
      if (!f.endsWith('.jsonl') || !UUID_RE.test(id)) continue
      try { out.push({ id, file: join(dir, f), mtimeMs: statSync(join(dir, f)).mtimeMs }) } catch { /* vanished */ }
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

export function findCliSessionFile(id: string): CliSessionFile | null {
  if (!UUID_RE.test(id)) return null
  return listCliSessionFiles().find((f) => f.id === id) ?? null
}

async function* lines(file: string): AsyncGenerator<Line> {
  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })
  for await (const raw of rl) {
    if (!raw) continue
    try { yield JSON.parse(raw) as Line } catch { /* skip */ }
  }
}

/** Plain user prompt text, or null for tool results / meta / command noise. */
function userPromptText(line: Line): string | null {
  if (line.isMeta || line.isSidechain) return null
  const content = (line.message as Line | undefined)?.content
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? (content as Block[]).filter((b) => b.type === 'text').map((b) => s(b.text)).join('\n')
      : ''
  if (!text.trim() || text.startsWith('<command-') || text.startsWith('<local-command') || text.startsWith('Caveat:')) return null
  return text
}

const cleanTitle = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 60)

export async function summarizeCliSession(f: CliSessionFile): Promise<CliSessionSummary> {
  let cwd = ''
  let firstPrompt = ''
  let named = ''
  let count = 0
  for await (const line of lines(f.file)) {
    if (!cwd && typeof line.cwd === 'string') cwd = line.cwd
    if (line.type === 'custom-title' && s(line.customTitle)) named = s(line.customTitle)
    else if ((line.type === 'ai-title' && s(line.aiTitle)) && !named) named = s(line.aiTitle)
    else if (line.type === 'summary' && s(line.summary) && !named) named = s(line.summary)
    if (line.type === 'user') {
      const t = userPromptText(line)
      if (t) { count++; if (!firstPrompt) firstPrompt = t }
    } else if (line.type === 'assistant' && !line.isSidechain) count++
  }
  return { cwd, title: cleanTitle(named || firstPrompt) || 'Untitled session', messageCount: count, lastActivityAt: Math.round(f.mtimeMs) }
}

export async function convertCliTranscript(f: CliSessionFile): Promise<StoredItem[]> {
  const items = new Map<string, StoredItem>()
  let sdkUuid: string | undefined
  const put = (item: TranscriptItem) => { items.delete(item.id); items.set(item.id, { item, sdkUuid }) }
  for await (const line of lines(f.file)) {
    if (line.isSidechain) continue
    const at = Date.parse(s(line.timestamp)) || f.mtimeMs
    const uuid = s(line.uuid) || `${items.size}`
    sdkUuid = s(line.uuid) || undefined
    const message = line.message as Line | undefined
    if (line.type === 'user') {
      const text = userPromptText(line)
      if (text) put({ id: `cli:${uuid}`, type: 'user', text, createdAt: at })
      if (Array.isArray(message?.content)) {
        for (const b of message.content as Block[]) {
          if (b.type !== 'tool_result') continue
          const toolUseId = s(b.tool_use_id)
          put({ id: `tool_result:${toolUseId}`, type: 'tool_result', toolUseId, content: toolResultText(b.content), isError: b.is_error === true || undefined, createdAt: at })
        }
      }
    } else if (line.type === 'assistant' && Array.isArray(message?.content)) {
      ;(message.content as Block[]).forEach((b, i) => {
        if (b.type === 'text' && s(b.text)) put({ id: `cli:${uuid}:${i}`, type: 'assistant', text: s(b.text), createdAt: at })
        else if (b.type === 'thinking' && s(b.thinking)) put({ id: `cli:${uuid}:${i}`, type: 'thinking', text: s(b.thinking), createdAt: at })
        else if (b.type === 'tool_use') put({ id: `tool_use:${s(b.id)}`, type: 'tool_use', toolUseId: s(b.id), name: s(b.name), input: b.input ?? {}, createdAt: at })
      })
    } else if (line.type === 'system' && line.subtype === 'compact_boundary') {
      put({ id: `cli:${uuid}`, type: 'system', subtype: 'compact', text: 'Conversation compacted', createdAt: at })
    }
  }
  return [...items.values()]
}
