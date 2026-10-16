import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
      {description && <p className="mt-0.5 text-[12px] text-fg-subtle">{description}</p>}
      <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-bg-elevated">{children}</div>
    </section>
  )
}

export function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3">
      <div className="min-w-0">
        <div className="text-[13px] text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] text-fg-subtle">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-border')}
    >
      <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform', checked && 'translate-x-4')} />
    </button>
  )
}

export interface Option<T extends string> { value: T; label: string }

export function Select<T extends string>({ value, options, onChange, label }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string }) {
  return (
    <select
      aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}
      className="h-8 min-w-40 rounded-lg border border-border bg-bg px-2 text-[13px] text-fg outline-none focus:border-accent"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Option<T>[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-border bg-bg p-0.5">
      {options.map((o) => (
        <button
          key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn('rounded-md px-3 py-1 text-[12px] text-fg-muted transition-colors',
            value === o.value ? 'bg-bg-elevated text-fg shadow-sm' : 'hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Button({ children, onClick, variant = 'secondary', className }: { children: ReactNode; onClick: () => void; variant?: 'secondary' | 'ghost'; className?: string }) {
  return (
    <button
      type="button" onClick={onClick}
      className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors',
        variant === 'secondary' ? 'border border-border bg-bg text-fg hover:bg-bg-hover' : 'text-fg-muted hover:bg-bg-hover hover:text-fg',
        className)}
    >
      {children}
    </button>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3 text-[13px] text-fg-subtle">{children}</div>
}
