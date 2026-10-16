import { memo, useState } from 'react'
import { ChevronRight, CircleAlert, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { TranscriptItem } from '@shared/ipc'
import { useSessions } from '../store'
import { Markdown } from '../transcript/Markdown'
import { describeTool, Pre } from './describe'
import { WIDGET_TOOL, WidgetCard } from './WidgetCard'

type ToolUse = Extract<TranscriptItem, { type: 'tool_use' }>
type ToolResult = Extract<TranscriptItem, { type: 'tool_result' }>

const NO_CHILDREN: string[] = []

interface Props {
  sessionId: string
  item: ToolUse
  cwd: string | null
  running: boolean
  depth?: number
}

export const ToolCard = memo(function ToolCard({ sessionId, item, cwd, running, depth = 0 }: Props) {
  const result = useSessions((s) => {
    const t = s.transcripts[sessionId]
    const rid = t?.results[item.toolUseId]
    return rid ? (t.items[rid] as ToolResult | undefined) : undefined
  })
  const childIds = useSessions((s) => s.transcripts[sessionId]?.children[item.toolUseId] ?? NO_CHILDREN)
  const view = describeTool(item.name, item.input, { cwd, result: result?.content })
  const [open, setOpen] = useState<boolean>(view.defaultOpen ?? false)
  const pending = !result && running
  const isError = !!result?.isError
  if (item.name === WIDGET_TOOL) return <WidgetCard input={item.input} pending={pending} error={isError ? result?.content : undefined} />
  const hasBody = !!view.body || childIds.length > 0 || (!!result?.content && view.result !== 'hidden') || (isError && !!result?.content)

  return (
    <div className={cn('rounded-xl border bg-bg-elevated/60', isError ? 'border-danger/40' : 'border-border')}>
      <button
        type="button"
        onClick={() => hasBody && setOpen(!open)}
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px]',
          hasBody && 'hover:bg-bg-hover/50'
        )}
      >
        <span className={cn('shrink-0', isError ? 'text-danger' : 'text-fg-muted')}>{view.icon}</span>
        <span className="shrink-0 font-medium">{view.label}</span>
        {view.summary && <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg-muted">{view.summary}</span>}
        {!view.summary && <span className="flex-1" />}
        {view.badge}
        {pending && <LoaderCircle className="size-3.5 shrink-0 animate-spin text-fg-subtle" />}
        {isError && <CircleAlert className="size-3.5 shrink-0 text-danger" />}
        {hasBody && <ChevronRight className={cn('size-3.5 shrink-0 text-fg-subtle transition-transform', open && 'rotate-90')} />}
      </button>
      {open && hasBody && (
        <div className="flex flex-col gap-2 border-t border-border/70 px-3 py-2.5">
          {view.body}
          {childIds.length > 0 && depth < 3 && (
            <div className="flex flex-col gap-1.5 border-l-2 border-border pl-3">
              {childIds.map((id) => (
                <ChildTool key={id} sessionId={sessionId} itemId={id} cwd={cwd} running={running} depth={depth + 1} />
              ))}
            </div>
          )}
          {result?.content && (isError || view.result !== 'hidden') && (
            isError ? (
              <Pre className="text-danger">{result.content}</Pre>
            ) : view.result === 'markdown' ? (
              <div className="max-h-96 overflow-auto rounded-lg bg-code-bg/60 px-3 py-2">
                <Markdown text={result.content} className="text-[13px]" />
              </div>
            ) : (
              <Pre>{result.content}</Pre>
            )
          )}
        </div>
      )}
    </div>
  )
})

function ChildTool(props: { sessionId: string; itemId: string; cwd: string | null; running: boolean; depth: number }) {
  const item = useSessions((s) => s.transcripts[props.sessionId]?.items[props.itemId])
  if (!item || item.type !== 'tool_use') return null
  return <ToolCard sessionId={props.sessionId} item={item} cwd={props.cwd} running={props.running} depth={props.depth} />
}
