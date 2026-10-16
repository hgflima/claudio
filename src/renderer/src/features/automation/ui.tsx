import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export const inputCls = 'h-8 w-full rounded-lg border border-border bg-bg px-2.5 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent'

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-fg-muted">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] leading-relaxed text-fg-subtle">{hint}</span>}
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-0.5 rounded-lg border border-border bg-bg p-0.5">
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={cn('rounded-md px-2.5 py-1 text-[12.5px] transition-colors', value === o.id ? 'bg-bg-hover font-medium text-fg' : 'text-fg-muted hover:text-fg')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} title={label} onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-border')}>
      <span className={cn('absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
    </button>
  )
}

export function Button({ variant = 'ghost', className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  return (
    <button type="button" {...props}
      className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors disabled:opacity-50',
        variant === 'primary' && 'bg-accent font-medium text-accent-fg hover:opacity-90',
        variant === 'ghost' && 'text-fg-muted hover:bg-bg-hover hover:text-fg',
        variant === 'danger' && 'text-danger hover:bg-danger/10',
        className)} />
  )
}
