// Captures a key combination and turns it into an Electron accelerator string.
import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

const CODE_KEYS: Record<string, string> = {
  Space: 'Space', Enter: 'Return', Tab: 'Tab', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Backquote: '`', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown'
}

function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code
  return CODE_KEYS[code] ?? null
}

export function toAccelerator(e: KeyboardEvent): string | null {
  const key = keyFromCode(e.code)
  if (!key) return null
  const mods = [e.metaKey && 'Command', e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean) as string[]
  const isFn = /^F\d+$/.test(key)
  if (!isFn && (mods.length === 0 || (mods.length === 1 && mods[0] === 'Shift'))) return null
  return [...mods, key].join('+')
}

const SYMBOLS: Record<string, string> = { Command: '⌘', CommandOrControl: '⌘', CmdOrCtrl: '⌘', Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Space: 'Space', Return: '↩' }

export function formatAccelerator(acc: string, mac: boolean): string {
  if (!acc) return 'Disabled'
  if (!mac) return acc
  const parts = acc.split('+')
  const key = parts.pop() ?? ''
  return parts.map((p) => SYMBOLS[p] ?? p).join('') + (SYMBOLS[key] ?? key)
}

export function ShortcutInput({ value, onChange, mac }: { value: string; onChange: (v: string) => void; mac: boolean }) {
  const [recording, setRecording] = useState(false)

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (!recording) return
    e.preventDefault(); e.stopPropagation()
    if (e.key === 'Escape') { setRecording(false); return }
    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      onChange(''); setRecording(false); return
    }
    const acc = toAccelerator(e)
    if (acc) { onChange(acc); setRecording(false) }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button" onClick={() => setRecording(true)} onBlur={() => setRecording(false)} onKeyDown={onKeyDown}
        data-capturing-shortcut={recording || undefined}
        className={cn('h-8 min-w-36 rounded-lg border px-3 text-[13px] transition-colors',
          recording ? 'border-accent bg-bg text-fg-muted' : 'border-border bg-bg text-fg hover:bg-bg-hover')}
      >
        {recording ? 'Press keys…' : formatAccelerator(value, mac)}
      </button>
      {value && !recording && (
        <button type="button" aria-label="Disable shortcut" onClick={() => onChange('')}
          className="flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-bg-hover hover:text-fg">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
