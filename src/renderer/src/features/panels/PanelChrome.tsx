import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function PanelToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex h-9 shrink-0 items-center gap-1 border-b border-border px-3', className)}>{children}</div>
}

export function ToolbarButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
      <div className="mb-1 text-fg-subtle">{icon}</div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {children && <div className="max-w-[260px] text-xs leading-relaxed text-fg-muted">{children}</div>}
    </div>
  )
}
