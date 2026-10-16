import { memo, useState } from 'react'
import { Brain, ChevronRight, CircleAlert, File as FileIcon, Info } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Attachment, TranscriptItem } from '@shared/ipc'
import { useSessions } from '../store'
import { basename, formatCost, formatDuration } from '../util'
import { ToolCard } from '../tools/ToolCard'
import { CopyButton, Markdown } from './Markdown'

type Of<T extends TranscriptItem['type']> = Extract<TranscriptItem, { type: T }>

interface ItemProps {
  sessionId: string
  itemId: string
  cwd: string | null
  running: boolean
}

export const TranscriptRow = memo(function TranscriptRow({ sessionId, itemId, cwd, running }: ItemProps) {
  const item = useSessions((s) => s.transcripts[sessionId]?.items[itemId])
  if (!item) return null
  switch (item.type) {
    case 'user':
      return <UserMessage item={item} />
    case 'assistant':
      return <AssistantMessage item={item} />
    case 'thinking':
      return <Thinking item={item} />
    case 'tool_use':
      return <ToolCard sessionId={sessionId} item={item} cwd={cwd} running={running} />
    case 'system':
      return <SystemLine item={item} />
    case 'result':
      return <ResultFooter item={item} />
    default:
      return null
  }
})

function UserMessage({ item }: { item: Of<'user'> }) {
  const images = (item.attachments ?? []).filter((a): a is Extract<Attachment, { type: 'image' }> => a.type === 'image')
  const files = (item.attachments ?? []).filter((a): a is Extract<Attachment, { type: 'file' }> => a.type === 'file')
  return (
    <div className="flex flex-col items-end gap-1.5 pl-16">
      {images.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {images.map((a, i) => (
            <img
              key={i}
              alt={a.name ?? 'image'}
              src={`data:${a.mediaType};base64,${a.dataBase64}`}
              className="size-20 rounded-lg border border-border object-cover"
            />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {files.map((f) => (
            <span key={f.path} title={f.path} className="flex items-center gap-1 rounded-md border border-border bg-bg-elevated px-2 py-0.5 text-xs text-fg-muted">
              <FileIcon className="size-3" /> {basename(f.path)}
            </span>
          ))}
        </div>
      )}
      {item.text && (
        <div className="max-w-full rounded-2xl rounded-br-md bg-bg-hover px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap break-words">
          {item.text}
        </div>
      )}
    </div>
  )
}

function AssistantMessage({ item }: { item: Of<'assistant'> }) {
  if (!item.text && !item.streaming) return null
  return (
    <div className="group/msg relative">
      <Markdown text={item.text} className="font-serif text-[15.5px] text-fg" />
      {item.streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-fg-subtle align-middle" />}
      {!item.streaming && item.text && (
        <div className="mt-1 -ml-1.5 opacity-0 transition-opacity group-hover/msg:opacity-100">
          <CopyButton text={item.text} />
        </div>
      )}
    </div>
  )
}

function Thinking({ item }: { item: Of<'thinking'> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-[13px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md py-0.5 text-fg-subtle hover:text-fg-muted"
      >
        <Brain className="size-3.5" />
        <span className={cn(item.streaming && 'animate-pulse')}>{item.streaming ? 'Thinking…' : 'Thought process'}</span>
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="mt-1.5 border-l-2 border-border pl-3 text-fg-muted whitespace-pre-wrap">{item.text}</div>
      )}
    </div>
  )
}

function SystemLine({ item }: { item: Of<'system'> }) {
  if (item.subtype === 'init') return null
  const isError = item.subtype === 'error'
  return (
    <div className={cn('flex items-start justify-center gap-1.5 text-xs', isError ? 'text-danger' : 'text-fg-subtle')}>
      {isError ? <CircleAlert className="mt-px size-3.5 shrink-0" /> : <Info className="mt-px size-3.5 shrink-0" />}
      <span className="whitespace-pre-wrap">{item.subtype === 'compact' ? item.text || 'Conversation compacted' : item.text}</span>
    </div>
  )
}

function ResultFooter({ item }: { item: Of<'result'> }) {
  const parts = [formatDuration(item.durationMs)]
  if (item.numTurns > 0) parts.push(`${item.numTurns} turn${item.numTurns === 1 ? '' : 's'}`)
  const title = item.costUsd != null ? `API-equivalent cost ${formatCost(item.costUsd)}` : undefined
  return (
    <div className={cn('flex flex-col items-start gap-1 text-[11.5px]', item.isError ? 'text-danger' : 'text-fg-subtle')}>
      {item.isError && item.text && <div className="whitespace-pre-wrap text-[13px]">{item.text}</div>}
      <div title={title}>{item.isError ? 'Stopped' : 'Done'} · {parts.join(' · ')}</div>
    </div>
  )
}
