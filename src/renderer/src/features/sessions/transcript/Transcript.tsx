import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, RotateCw } from 'lucide-react'
import type { SessionMeta } from '@shared/ipc'
import { loadTranscript, useSessions, workPath } from '../store'
import { Button } from '../ui/Dialog'
import { TranscriptRow } from './Items'

const NO_IDS: string[] = []
const STICK_PX = 80

export function Transcript({ session, footer }: { session: SessionMeta; footer?: React.ReactNode }) {
  const status = useSessions((s) => s.transcripts[session.id]?.status)
  const error = useSessions((s) => s.transcripts[session.id]?.error)
  const ids = useSessions((s) => s.transcripts[session.id]?.topIds ?? NO_IDS)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  const running = session.status === 'running' || session.status === 'awaiting-permission'

  useEffect(() => {
    stick.current = true
    setAtBottom(true)
  }, [session.id])

  // Follow content growth (streaming, expanding cards) only while the user is at the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content) return
    const follow = () => {
      if (stick.current) el.scrollTop = el.scrollHeight
    }
    follow()
    const ro = new ResizeObserver(follow)
    ro.observe(content)
    return () => ro.disconnect()
  }, [session.id, status])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX
    stick.current = bottom
    if (bottom !== atBottom) setAtBottom(bottom)
  }

  const scrollToBottom = () => {
    const el = scrollRef.current
    if (!el) return
    stick.current = true
    setAtBottom(true)
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} data-transcript-scroll={session.id} className="h-full overflow-y-auto">
        <div ref={contentRef} data-transcript-content={session.id} className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 pt-8 pb-6">
          {status === 'loading' && <TranscriptSkeleton />}
          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 py-16 text-sm text-fg-muted">
              <div>Couldn’t load this conversation{error ? `: ${error}` : '.'}</div>
              <Button onClick={() => void loadTranscript(session.id, true)}>
                <RotateCw className="size-3.5" /> Retry
              </Button>
            </div>
          )}
          {status === 'ready' && ids.length === 0 && !running && (
            <div className="py-16 text-center font-serif text-lg text-fg-subtle">Nothing here yet.</div>
          )}
          {ids.map((id) => (
            <TranscriptRow key={id} sessionId={session.id} itemId={id} cwd={workPath(session)} running={running} />
          ))}
          {status === 'ready' && session.status === 'running' && <WorkingIndicator />}
          {footer}
        </div>
      </div>
      {!atBottom && (
        <button
          type="button"
          aria-label="Scroll to bottom"
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-bg-elevated text-fg-muted shadow-md hover:text-fg"
        >
          <ArrowDown className="size-4" />
        </button>
      )}
    </div>
  )
}

function WorkingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1" aria-label="Claude is working">
      {[0, 150, 300].map((d) => (
        <span key={d} className="size-1.5 animate-bounce rounded-full bg-accent/70" style={{ animationDelay: `${d}ms` }} />
      ))}
    </div>
  )
}

function TranscriptSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="ml-auto h-10 w-1/2 animate-pulse rounded-2xl bg-bg-hover" />
      <div className="flex flex-col gap-2">
        {[95, 88, 60].map((w) => (
          <div key={w} className="h-3.5 animate-pulse rounded bg-bg-hover" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="h-9 w-full animate-pulse rounded-xl bg-bg-hover/70" />
      <div className="ml-auto h-8 w-1/3 animate-pulse rounded-2xl bg-bg-hover" />
    </div>
  )
}
