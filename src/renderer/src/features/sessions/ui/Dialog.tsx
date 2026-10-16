import { useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children?: ReactNode
  footer?: ReactNode
  className?: string
}

export function Dialog({ open, onClose, title, children, footer, className }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-[1px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        className={cn(
          'flex max-h-full w-full max-w-md flex-col rounded-2xl border border-border bg-bg-elevated shadow-xl',
          className
        )}
      >
        <div className="px-6 pt-5 pb-2 text-[15px] font-semibold">{title}</div>
        {children && <div className="min-h-0 overflow-auto px-6 py-2 text-sm text-fg-muted">{children}</div>}
        {footer && <div className="flex justify-end gap-2 px-6 pt-3 pb-5">{footer}</div>}
      </div>
    </div>
  )
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

export function Button({
  variant = 'secondary',
  className,
  ...props
}: React.ComponentProps<'button'> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
        variant === 'primary' && 'bg-fg text-bg hover:opacity-90',
        variant === 'secondary' && 'border border-border bg-bg-elevated hover:bg-bg-hover',
        variant === 'danger' && 'bg-danger text-white hover:opacity-90',
        variant === 'ghost' && 'text-fg-muted hover:bg-bg-hover hover:text-fg',
        className
      )}
    />
  )
}

interface ConfirmProps {
  open: boolean
  title: ReactNode
  body?: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button autoFocus variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body}
    </Dialog>
  )
}
