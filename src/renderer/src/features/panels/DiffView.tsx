import { memo, useMemo } from 'react'
import { cn } from '@/lib/cn'
import { parsePatch, type DiffLine } from './parsePatch'

const MAX_LINES = 5000

const Row = memo(function Row({ line }: { line: DiffLine }) {
  if (line.kind === 'hunk') {
    return (
      <div className="flex bg-accent/5 text-fg-subtle">
        <span className="w-[72px] shrink-0 select-none" />
        <span className="whitespace-pre px-2 py-0.5">{line.text}</span>
      </div>
    )
  }
  if (line.kind === 'meta') {
    return <div className="px-3 py-0.5 italic text-fg-subtle">{line.text}</div>
  }
  return (
    <div className={cn('flex', line.kind === 'add' && 'bg-success/10', line.kind === 'del' && 'bg-danger/10')}>
      <span className="w-9 shrink-0 select-none pr-1 text-right text-fg-subtle/70">{line.oldNo ?? ''}</span>
      <span className="w-9 shrink-0 select-none pr-1 text-right text-fg-subtle/70">{line.newNo ?? ''}</span>
      <span className={cn('w-4 shrink-0 select-none text-center', line.kind === 'add' && 'text-success', line.kind === 'del' && 'text-danger', line.kind === 'ctx' && 'text-transparent')}>
        {line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}
      </span>
      <span className="whitespace-pre pr-4 text-fg">{line.text || ' '}</span>
    </div>
  )
})

export function DiffView({ patch }: { patch: string }) {
  const parsed = useMemo(() => parsePatch(patch), [patch])
  if (!parsed.lines.length) return <p className="px-4 py-6 text-center text-xs text-fg-muted">No textual changes.</p>
  const shown = parsed.lines.slice(0, MAX_LINES)
  return (
    <div className="min-w-max py-1 font-mono text-[11.5px] leading-[1.55]">
      {shown.map((l, i) => <Row key={i} line={l} />)}
      {parsed.lines.length > MAX_LINES && (
        <p className="px-4 py-3 font-sans text-xs text-fg-muted">Diff truncated — {parsed.lines.length - MAX_LINES} more lines.</p>
      )}
    </div>
  )
}
