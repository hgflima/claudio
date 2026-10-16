import { memo, useMemo } from 'react'
import { diffLines } from 'diff'
import { cn } from '@/lib/cn'

type Line = { kind: '+' | '-' | ' ' | '…'; text: string }

const CONTEXT = 3
const MAX_LINES = 600

function buildLines(oldText: string, newText: string): Line[] {
  const out: Line[] = []
  for (const part of diffLines(oldText, newText)) {
    const lines = part.value.replace(/\n$/, '').split('\n')
    if (part.added) lines.forEach((t) => out.push({ kind: '+', text: t }))
    else if (part.removed) lines.forEach((t) => out.push({ kind: '-', text: t }))
    else if (lines.length > CONTEXT * 2 + 1) {
      lines.slice(0, CONTEXT).forEach((t) => out.push({ kind: ' ', text: t }))
      out.push({ kind: '…', text: `${lines.length - CONTEXT * 2} unchanged lines` })
      lines.slice(-CONTEXT).forEach((t) => out.push({ kind: ' ', text: t }))
    } else lines.forEach((t) => out.push({ kind: ' ', text: t }))
  }
  return out
}

export function diffStats(oldText: string, newText: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const p of diffLines(oldText, newText)) {
    const n = p.count ?? p.value.split('\n').length - 1
    if (p.added) added += n
    else if (p.removed) removed += n
  }
  return { added, removed }
}

export const DiffView = memo(function DiffView({ oldText, newText, className }: { oldText: string; newText: string; className?: string }) {
  const lines = useMemo(() => buildLines(oldText, newText), [oldText, newText])
  const shown = lines.slice(0, MAX_LINES)
  return (
    <div className={cn('max-h-96 overflow-auto rounded-lg border border-border bg-code-bg font-mono text-[12px] leading-[1.55]', className)}>
      <div className="min-w-max py-1">
        {shown.map((l, i) => (
          <div
            key={i}
            className={cn(
              'flex px-2',
              l.kind === '+' && 'bg-success/12 text-fg',
              l.kind === '-' && 'bg-danger/12 text-fg',
              l.kind === '…' && 'text-fg-subtle italic'
            )}
          >
            <span
              className={cn(
                'w-4 shrink-0 select-none',
                l.kind === '+' && 'text-success',
                l.kind === '-' && 'text-danger',
                l.kind === ' ' && 'text-fg-subtle'
              )}
            >
              {l.kind === '…' ? '' : l.kind}
            </span>
            <span className="whitespace-pre">{l.text || ' '}</span>
          </div>
        ))}
        {lines.length > MAX_LINES && <div className="px-2 text-fg-subtle italic">… {lines.length - MAX_LINES} more lines</div>}
      </div>
    </div>
  )
})

export function DiffStat({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="shrink-0 font-mono text-[11px]">
      {added > 0 && <span className="text-success">+{added}</span>}
      {added > 0 && removed > 0 && ' '}
      {removed > 0 && <span className="text-danger">−{removed}</span>}
    </span>
  )
}
