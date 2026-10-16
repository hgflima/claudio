import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, File as FileIcon, Paperclip, Square, X } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { Attachment } from '@shared/ipc'
import { useSessions } from '../store'
import { basename } from '../util'
import { attachmentKey, filesToAttachments, pathsToAttachments } from './attachments'
import { Suggestions, useSuggestions } from './Suggestions'
import { drafts } from './drafts'


interface ComposerProps {
  draftKey: string
  sessionId?: string
  cwd: string | null
  running?: boolean
  large?: boolean
  placeholder: string
  pills?: ReactNode
  status?: ReactNode
  /** Resolve to false to keep the composer content (e.g. waiting on a dialog). */
  onSubmit: (text: string, attachments: Attachment[]) => Promise<boolean | void> | void
  onInterrupt?: () => void
  /** Enter on an empty composer (e.g. to approve a pending permission). Return true if handled. */
  onEmptyEnter?: () => boolean
}

export function Composer(props: ComposerProps) {
  return <ComposerInner key={props.draftKey} {...props} />
}

function ComposerInner(props: ComposerProps) {
  const { draftKey, sessionId, cwd, running, large, placeholder, pills, status, onSubmit, onInterrupt, onEmptyEnter } = props
  const [text, setText] = useState(() => drafts.get(draftKey)?.text ?? '')
  const [attachments, setAttachments] = useState<Attachment[]>(() => drafts.get(draftKey)?.attachments ?? [])
  const [caret, setCaret] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [sending, setSending] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const focusTick = useSessions((s) => s.focusTick)

  useEffect(() => {
    drafts.set(draftKey, { text, attachments })
  }, [draftKey, text, attachments])

  useEffect(() => {
    ref.current?.focus()
  }, [focusTick, draftKey])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, large ? 320 : 260)}px`
  }, [text, large])

  const sugg = useSuggestions({ text, caret, cwd, sessionId })

  const applySuggestion = useCallback(
    (insert: string, start: number) => {
      const next = text.slice(0, start) + insert + text.slice(caret)
      setText(next)
      const pos = start + insert.length
      requestAnimationFrame(() => {
        ref.current?.setSelectionRange(pos, pos)
        setCaret(pos)
      })
    },
    [text, caret]
  )

  const addAttachments = async (p: Promise<Attachment[]>) => {
    const list = await p
    if (list.length) setAttachments((cur) => [...cur, ...list])
  }

  const submit = async () => {
    const t = text.trim()
    if ((!t && !attachments.length) || sending) return
    setSending(true)
    try {
      if ((await onSubmit(t, attachments)) === false) return
      setText('')
      setAttachments([])
      drafts.delete(draftKey)
    } catch (e) {
      console.error(e)
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (sugg.open && sugg.onKeyDown(e, applySuggestion)) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!text.trim() && !attachments.length && onEmptyEnter?.()) return
      void submit()
    } else if (e.key === 'Escape' && running && onInterrupt && !document.querySelector('[role=dialog]')) {
      e.preventDefault()
      onInterrupt()
    }
  }

  const canSend = (!!text.trim() || attachments.length > 0) && !sending

  return (
    <div
      className={cn(
        'relative rounded-2xl border bg-bg-elevated shadow-[0_1px_6px_rgba(0,0,0,0.04)] transition-colors focus-within:border-fg-subtle/60',
        dragging ? 'border-accent' : 'border-border'
      )}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void addAttachments(filesToAttachments([...e.dataTransfer.files]))
      }}
    >
      {sugg.open && <Suggestions state={sugg} onPick={applySuggestion} />}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((a, i) => (
            <AttachmentChip key={attachmentKey(a, i)} a={a} onRemove={() => setAttachments((cur) => cur.filter((_, j) => j !== i))} />
          ))}
        </div>
      )}

      <textarea
        ref={ref}
        value={text}
        rows={1}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value)
          setCaret(e.target.selectionStart)
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          const files = [...e.clipboardData.files]
          if (files.length) {
            e.preventDefault()
            void addAttachments(filesToAttachments(files))
          }
        }}
        className={cn(
          'block w-full resize-none bg-transparent px-4 outline-none placeholder:text-fg-subtle',
          large ? 'min-h-[88px] pt-4 pb-2 text-[15px]' : 'min-h-[52px] pt-3.5 pb-1.5 text-[14.5px]'
        )}
      />

      <div className="flex items-center gap-1 px-2 pb-2">
        <button
          type="button"
          aria-label="Attach files"
          title="Attach files"
          onClick={async () => {
            const paths = await api.invoke('app:pickFiles')
            if (paths.length) void addAttachments(pathsToAttachments(paths))
          }}
          className="flex size-7 items-center justify-center rounded-lg text-fg-muted hover:bg-bg-hover hover:text-fg"
        >
          <Paperclip className="size-4" />
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">{pills}</div>
        {status}
        {running && onInterrupt && (
          <button
            type="button"
            aria-label="Stop"
            title="Stop (Esc)"
            onClick={onInterrupt}
            className="flex size-8 items-center justify-center rounded-full border border-border bg-bg text-fg hover:bg-bg-hover"
          >
            <Square className="size-3 fill-current" />
          </button>
        )}
        {(!running || canSend) && (
          <button
            type="button"
            aria-label="Send"
            disabled={!canSend}
            onClick={() => void submit()}
            className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  )
}

function AttachmentChip({ a, onRemove }: { a: Attachment; onRemove: () => void }) {
  return (
    <div className="group relative">
      {a.type === 'image' ? (
        <img
          src={`data:${a.mediaType};base64,${a.dataBase64}`}
          alt={a.name ?? 'image'}
          className="size-14 rounded-lg border border-border object-cover"
        />
      ) : (
        <div title={a.path} className="flex h-14 max-w-48 items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 text-xs text-fg-muted">
          <FileIcon className="size-3.5 shrink-0" />
          <span className="truncate">{basename(a.path)}</span>
        </div>
      )}
      <button
        type="button"
        aria-label="Remove attachment"
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 hidden size-5 items-center justify-center rounded-full border border-border bg-bg-elevated text-fg-muted shadow-sm group-hover:flex hover:text-fg"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}
