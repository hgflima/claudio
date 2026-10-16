// Session meta (JSON) + transcript (JSONL of final items) under userData/sessions.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SessionMeta, TranscriptItem } from '@shared/ipc'
import { dataPath, readJson, writeJson } from '../core/store'
import { log } from '../core/log'

export interface StoredMeta extends SessionMeta {
  titleSource?: 'auto' | 'user'
}

const metaFile = (id: string) => dataPath('sessions', `${id}.json`)
const transcriptFile = (id: string) => dataPath('sessions', `${id}.jsonl`)

export function loadAllMetas(): StoredMeta[] {
  const dir = dataPath('sessions')
  if (!existsSync(dir)) return []
  const out: StoredMeta[] = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    const m = readJson<StoredMeta | null>(dataPath('sessions', f), null)
    if (m?.id) out.push(m)
  }
  return out
}

export function saveMeta(meta: StoredMeta): void {
  writeJson(metaFile(meta.id), meta)
}

export function loadTranscript(id: string): TranscriptItem[] {
  const file = transcriptFile(id)
  if (!existsSync(file)) return []
  const byId = new Map<string, TranscriptItem>()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue
    try {
      const item = JSON.parse(line) as TranscriptItem
      byId.delete(item.id) // re-insert keeps latest version at its latest position
      byId.set(item.id, item)
    } catch { /* skip corrupt line */ }
  }
  return [...byId.values()]
}

export function appendItems(id: string, items: TranscriptItem[]): void {
  if (!items.length) return
  const file = transcriptFile(id)
  try {
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, items.map((i) => JSON.stringify(i)).join('\n') + '\n', { mode: 0o600 })
  } catch (e) { log.error('[sessions] transcript append failed', e) }
}

export function deleteSessionFiles(id: string): void {
  for (const f of [metaFile(id), transcriptFile(id)]) rmSync(f, { force: true })
  rmSync(dataPath('chat-scratch', id), { recursive: true, force: true })
}
