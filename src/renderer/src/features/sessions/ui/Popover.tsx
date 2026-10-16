import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

interface PopoverProps {
  anchor: { x: number; y: number } | null
  onClose: () => void
  children: ReactNode
  className?: string
  placement?: 'below' | 'above'
}

/** Fixed-position floating panel anchored at viewport coords; closes on outside click / Esc. */
export function Popover({ anchor, onClose, children, className, placement = 'below' }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!anchor) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onClose)
    }
  }, [anchor, onClose])

  if (!anchor) return null
  const style: React.CSSProperties =
    placement === 'below'
      ? { left: Math.min(anchor.x, window.innerWidth - 240), top: anchor.y }
      : { left: Math.min(anchor.x, window.innerWidth - 240), bottom: window.innerHeight - anchor.y }
  return createPortal(
    <div
      ref={ref}
      style={style}
      className={cn(
        'no-drag fixed z-50 min-w-44 rounded-xl border border-border bg-bg-elevated p-1 text-sm shadow-lg',
        className
      )}
    >
      {children}
    </div>,
    document.body
  )
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  active,
  hint
}: {
  icon?: ReactNode
  children: ReactNode
  onClick: () => void
  danger?: boolean
  active?: boolean
  hint?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-bg-hover',
        danger && 'text-danger',
        active && 'bg-bg-hover'
      )}
    >
      {icon && <span className="flex size-4 shrink-0 items-center justify-center text-fg-muted">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-xs text-fg-subtle">{hint}</span>}
    </button>
  )
}

export function anchorBelow(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.bottom + 4 }
}

export function anchorAbove(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top - 4 }
}
