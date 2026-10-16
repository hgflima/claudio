import type { ReactNode } from 'react'
import {
  Bot, CircleCheck, Circle, CircleDot, FilePen, FilePlus, FileSearch, FileText, FolderSearch, Globe,
  ListTodo, Plug, Search, Terminal, Wrench, ClipboardList, Brain
} from 'lucide-react'
import { asRecord, relativeTo, str } from '../util'
import { DiffStat, DiffView, diffStats } from './DiffView'
import { Markdown } from '../transcript/Markdown'

export interface ToolView {
  icon: ReactNode
  label: string
  summary?: string
  badge?: ReactNode
  body?: ReactNode // rendered above the result
  result?: 'pre' | 'markdown' | 'hidden' | 'count'
  defaultOpen?: boolean
}

interface Ctx { cwd: string | null; result?: string }

const ic = 'size-3.5'

export function Pre({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <pre
      className={
        'max-h-80 overflow-auto rounded-lg bg-code-bg px-3 py-2 font-mono text-[12px] leading-[1.55] whitespace-pre-wrap break-words ' +
        (className ?? '')
      }
    >
      {children}
    </pre>
  )
}

export function Json({ value }: { value: unknown }) {
  return <Pre>{JSON.stringify(value, null, 2)}</Pre>
}

type Edit = { old_string?: unknown; new_string?: unknown }

function editsOf(name: string, input: Record<string, unknown>): { old: string; new: string }[] {
  if (name === 'MultiEdit' && Array.isArray(input.edits))
    return (input.edits as Edit[]).map((e) => ({ old: str(e.old_string), new: str(e.new_string) }))
  if (name === 'Write') return [{ old: '', new: str(input.content) }]
  return [{ old: str(input.old_string), new: str(input.new_string) }]
}

export function EditDiff({ name, input }: { name: string; input: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-2">
      {editsOf(name, input).map((e, i) => (
        <DiffView key={i} oldText={e.old} newText={e.new} />
      ))}
    </div>
  )
}

function countLines(s?: string): number {
  if (!s) return 0
  return s.split('\n').filter((l) => l.trim()).length
}

export function describeTool(name: string, rawInput: unknown, ctx: Ctx): ToolView {
  const input = asRecord(rawInput)
  const rel = (p: unknown) => relativeTo(str(p), ctx.cwd)

  switch (name) {
    case 'Bash':
    case 'BashOutput':
      return {
        icon: <Terminal className={ic} />,
        label: 'Bash',
        summary: str(input.description) || str(input.command),
        body: input.command ? <Pre className="text-fg-muted">$ {str(input.command)}</Pre> : undefined,
        result: 'pre'
      }
    case 'Read':
      return {
        icon: <FileText className={ic} />,
        label: 'Read',
        summary: rel(input.file_path) + (input.offset ? ` (from line ${str(input.offset)})` : ''),
        result: 'pre'
      }
    case 'Edit':
    case 'MultiEdit':
    case 'Write': {
      const stats = editsOf(name, input).reduce(
        (acc, e) => {
          const d = diffStats(e.old, e.new)
          return { added: acc.added + d.added, removed: acc.removed + d.removed }
        },
        { added: 0, removed: 0 }
      )
      return {
        icon: name === 'Write' ? <FilePlus className={ic} /> : <FilePen className={ic} />,
        label: name === 'Write' ? 'Write' : 'Edit',
        summary: rel(input.file_path),
        badge: <DiffStat {...stats} />,
        body: <EditDiff name={name} input={input} />,
        result: 'hidden',
        defaultOpen: true
      }
    }
    case 'NotebookEdit':
      return { icon: <FilePen className={ic} />, label: 'Edit notebook', summary: rel(input.notebook_path), body: <Pre>{str(input.new_source)}</Pre>, result: 'hidden' }
    case 'Grep':
      return {
        icon: <FileSearch className={ic} />,
        label: 'Search',
        summary: `“${str(input.pattern)}”${input.path ? ` in ${rel(input.path)}` : ''}${input.glob ? ` (${str(input.glob)})` : ''}`,
        badge: ctx.result !== undefined ? <Count n={countLines(ctx.result)} /> : undefined,
        result: 'pre'
      }
    case 'Glob':
      return {
        icon: <FolderSearch className={ic} />,
        label: 'Find files',
        summary: str(input.pattern) + (input.path ? ` in ${rel(input.path)}` : ''),
        badge: ctx.result !== undefined ? <Count n={countLines(ctx.result)} /> : undefined,
        result: 'pre'
      }
    case 'TodoWrite':
      return {
        icon: <ListTodo className={ic} />,
        label: 'Update todos',
        summary: todoSummary(input.todos),
        body: <Todos todos={input.todos} />,
        result: 'hidden',
        defaultOpen: true
      }
    case 'WebFetch':
      return {
        icon: <Globe className={ic} />,
        label: 'Fetch',
        summary: str(input.url),
        body: input.prompt ? <div className="text-xs text-fg-muted">{str(input.prompt)}</div> : undefined,
        result: 'markdown'
      }
    case 'WebSearch':
      return { icon: <Search className={ic} />, label: 'Web search', summary: str(input.query), result: 'markdown' }
    case 'Task':
    case 'Agent':
      return {
        icon: <Bot className={ic} />,
        label: str(input.subagent_type) ? `Agent · ${str(input.subagent_type)}` : 'Agent',
        summary: str(input.description),
        body: input.prompt ? (
          <details className="text-xs text-fg-muted">
            <summary className="cursor-default select-none">Prompt</summary>
            <Pre className="mt-1">{str(input.prompt)}</Pre>
          </details>
        ) : undefined,
        result: 'markdown'
      }
    case 'ExitPlanMode':
      return {
        icon: <ClipboardList className={ic} />,
        label: 'Plan',
        body: input.plan ? <Markdown text={str(input.plan)} className="font-serif text-[14px]" /> : undefined,
        result: 'hidden',
        defaultOpen: true
      }
    case 'AskUserQuestion':
      return { icon: <Brain className={ic} />, label: 'Question', summary: questionSummary(input.questions), result: 'pre' }
  }

  if (name.startsWith('mcp__')) {
    const [, server, ...rest] = name.split('__')
    return {
      icon: <Plug className={ic} />,
      label: `${server} · ${rest.join('__')}`,
      summary: firstScalar(input),
      body: Object.keys(input).length ? <Json value={input} /> : undefined,
      result: 'pre'
    }
  }
  return {
    icon: <Wrench className={ic} />,
    label: name,
    summary: firstScalar(input),
    body: Object.keys(input).length ? <Json value={input} /> : undefined,
    result: 'pre'
  }
}

function firstScalar(input: Record<string, unknown>): string | undefined {
  for (const v of Object.values(input)) if (typeof v === 'string' || typeof v === 'number') return String(v)
  return undefined
}

function Count({ n }: { n: number }) {
  return <span className="shrink-0 text-[11px] text-fg-subtle">{n === 0 ? 'no results' : `${n} result${n === 1 ? '' : 's'}`}</span>
}

type Todo = { content?: string; status?: string; activeForm?: string }

function todoSummary(todos: unknown): string | undefined {
  if (!Array.isArray(todos)) return undefined
  const list = todos as Todo[]
  const done = list.filter((t) => t.status === 'completed').length
  const active = list.find((t) => t.status === 'in_progress')
  return active?.activeForm || active?.content || `${done}/${list.length} done`
}

function questionSummary(qs: unknown): string | undefined {
  if (!Array.isArray(qs)) return undefined
  return (qs as { question?: string }[]).map((q) => q.question).filter(Boolean).join(' · ')
}

export function Todos({ todos }: { todos: unknown }) {
  if (!Array.isArray(todos)) return null
  return (
    <ul className="flex flex-col gap-1 py-0.5 text-[13px]">
      {(todos as Todo[]).map((t, i) => (
        <li key={i} className="flex items-start gap-2">
          {t.status === 'completed' ? (
            <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
          ) : t.status === 'in_progress' ? (
            <CircleDot className="mt-0.5 size-3.5 shrink-0 text-accent" />
          ) : (
            <Circle className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" />
          )}
          <span className={t.status === 'completed' ? 'text-fg-subtle line-through' : t.status === 'in_progress' ? 'font-medium' : ''}>
            {t.content}
          </span>
        </li>
      ))}
    </ul>
  )
}
