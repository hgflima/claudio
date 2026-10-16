// Owner: agent "mcp-quick". Floating Quick Entry card (rendered in the transparent quick window).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import { ArrowUp, X } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { DestinationButton, DestinationMenu } from './DestinationPicker'
import { imagesFrom, type ImageAttachment } from './images'
import { useTheme } from './useTheme'

const DEST_KEY = 'claudio.quick.destination'

function loadDestination(): string | null {
  try { return localStorage.getItem(DEST_KEY) || null } catch { return null }
}

export function QuickEntry() {
  useTheme()
  const [text, setText] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [cwd, setCwd] = useState<string | null>(loadDestination)
  const [dragging, setDragging] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Let the window size itself to the card (main listens to preferred-size-changed).
  useLayoutEffect(() => {
    for (const el of [document.documentElement, document.body, document.getElementById('root')]) if (el) el.style.height = 'auto'
  }, [])

  const refreshContext = useCallback(() => {
    void api.invoke('quick:getContext').then(({ recentFolders }) => {
      setFolders(recentFolders)
      setCwd((c) => (c && !recentFolders.includes(c) ? null : c))
    })
  }, [])

  useEffect(() => {
    refreshContext()
    return api.on('quick:shown', () => {
      refreshContext()
      setPickerOpen(false)
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select() })
    })
  }, [refreshContext])

  useEffect(() => {
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (pickerOpen) { setPickerOpen(false); inputRef.current?.focus() }
      else void api.invoke('quick:dismiss')
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [pickerOpen])

  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [text])

  const chooseDestination = (next: string | null) => {
    setCwd(next)
    setPickerOpen(false)
    try { if (next) localStorage.setItem(DEST_KEY, next); else localStorage.removeItem(DEST_KEY) } catch { /* ignore */ }
    inputRef.current?.focus()
  }

  const addImages = async (files: Iterable<File>) => {
    const next = await imagesFrom(files)
    if (next.length) setImages((cur) => [...cur, ...next].slice(0, 20))
  }

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed && images.length === 0) return
    void api.invoke('quick:submit', { text: trimmed, attachments: images.length ? images : undefined, cwd })
    setText('')
    setImages([])
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
  }

  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
    if (files.length) { e.preventDefault(); void addImages(files) }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void addImages(e.dataTransfer.files)
  }

  const canSend = text.trim().length > 0 || images.length > 0

  return (
    <div className="p-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'drag rounded-2xl border border-border bg-bg-elevated shadow-[0_12px_40px_rgba(0,0,0,0.18),0_2px_8px_rgba(0,0,0,0.08)] transition-colors',
          dragging && 'border-accent'
        )}
      >
        {images.length > 0 && (
          <div className="no-drag flex gap-2 overflow-x-auto px-4 pt-4">
            {images.map((img, i) => (
              <div key={i} className="group relative size-16 shrink-0 overflow-hidden rounded-lg border border-border">
                <img src={`data:${img.mediaType};base64,${img.dataBase64}`} alt={img.name ?? 'Pasted image'} className="size-full object-cover" />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 hidden rounded-full bg-black/60 p-0.5 text-white group-hover:block"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={inputRef}
          autoFocus
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder="How can I help you today?"
          className="no-drag block w-full resize-none bg-transparent px-5 pt-4 pb-2 font-serif text-[17px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
        />
        <div className="flex items-center justify-between px-3 pb-3">
          <div className="no-drag">
            <DestinationButton value={cwd} open={pickerOpen} onToggle={() => setPickerOpen((o) => !o)} />
          </div>
          <div className="no-drag flex items-center gap-2">
            <span className="text-[11px] text-fg-subtle">Esc to close</span>
            <button
              type="button"
              aria-label="Send"
              disabled={!canSend}
              onClick={submit}
              className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-fg transition-opacity disabled:opacity-40"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>
        {pickerOpen && <DestinationMenu value={cwd} folders={folders} onChange={chooseDestination} />}
      </div>
    </div>
  )
}
