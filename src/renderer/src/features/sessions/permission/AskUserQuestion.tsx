import { useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { PermissionRequest, PermissionResponse } from '@shared/ipc'
import { Button } from '../ui/Dialog'

interface Option { label: string; description?: string; preview?: string }
interface Question { question: string; header?: string; options: Option[]; multiSelect?: boolean }

type Respond = (r: Omit<PermissionResponse, 'sessionId' | 'requestId'>) => void

const OTHER = '__other__'

function parseQuestions(input: Record<string, unknown>): Question[] {
  if (!Array.isArray(input.questions)) return []
  return (input.questions as Question[]).filter((q) => q && typeof q.question === 'string' && Array.isArray(q.options))
}

export function AskUserQuestionCard({ request, respond }: { request: PermissionRequest; respond: Respond }) {
  const questions = parseQuestions(request.input)
  const [picked, setPicked] = useState<Record<number, string[]>>({})
  const [other, setOther] = useState<Record<number, string>>({})

  const toggle = (qi: number, label: string, multi: boolean) =>
    setPicked((p) => {
      const cur = p[qi] ?? []
      const next = multi ? (cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]) : [label]
      return { ...p, [qi]: next }
    })

  const answerFor = (qi: number): string => {
    const sel = picked[qi] ?? []
    return sel.map((l) => (l === OTHER ? (other[qi] ?? '').trim() : l)).filter(Boolean).join(', ')
  }
  const complete = questions.every((_, i) => answerFor(i).length > 0)

  const submit = () => {
    const answers: Record<string, string> = {}
    questions.forEach((q, i) => (answers[q.question] = answerFor(i)))
    respond({ decision: 'allow', scope: 'once', updatedInput: { ...request.input, answers } })
  }

  return (
    <div className="flex max-h-[55vh] flex-col gap-4 overflow-auto p-4">
      {questions.map((q, qi) => {
        const multi = !!q.multiSelect
        const sel = picked[qi] ?? []
        return (
          <div key={qi} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              {q.header && (
                <span className="shrink-0 rounded-md bg-accent/12 px-1.5 py-0.5 text-[11px] font-medium text-accent">{q.header}</span>
              )}
              <span className="text-[14px] font-medium">{q.question}</span>
            </div>
            {multi && <div className="-mt-1 text-xs text-fg-subtle">Select all that apply</div>}
            <div className="flex flex-col gap-1.5">
              {q.options.map((o) => (
                <OptionRow key={o.label} selected={sel.includes(o.label)} multi={multi} onClick={() => toggle(qi, o.label, multi)}>
                  <div className="text-[13px] font-medium">{o.label}</div>
                  {o.description && <div className="text-xs text-fg-muted">{o.description}</div>}
                  {o.preview && sel.includes(o.label) && (
                    <pre className="mt-1.5 overflow-auto rounded-md bg-code-bg px-2 py-1.5 font-mono text-[11.5px] whitespace-pre">{o.preview}</pre>
                  )}
                </OptionRow>
              ))}
              <OptionRow selected={sel.includes(OTHER)} multi={multi} onClick={() => !sel.includes(OTHER) && toggle(qi, OTHER, multi)}>
                <input
                  value={other[qi] ?? ''}
                  onFocus={() => !sel.includes(OTHER) && toggle(qi, OTHER, multi)}
                  onChange={(e) => setOther((p) => ({ ...p, [qi]: e.target.value }))}
                  placeholder="Other…"
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-fg-subtle"
                />
              </OptionRow>
            </div>
          </div>
        )
      })}
      <div className="flex gap-2">
        <Button variant="primary" disabled={!complete} onClick={submit}>
          Submit
        </Button>
        <Button
          variant="ghost"
          onClick={() => respond({ decision: 'deny', scope: 'once', message: 'The user declined to answer.' })}
        >
          Skip
        </Button>
      </div>
    </div>
  )
}

function OptionRow({ selected, multi, onClick, children }: { selected: boolean; multi: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && e.target === e.currentTarget && (e.preventDefault(), onClick())}
      className={cn(
        'flex cursor-default items-start gap-2.5 rounded-xl border px-3 py-2 outline-none focus-visible:border-fg-subtle',
        selected ? 'border-accent/60 bg-accent/6' : 'border-border hover:bg-bg-hover/60'
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center border',
          multi ? 'rounded' : 'rounded-full',
          selected ? 'border-accent bg-accent text-accent-fg' : 'border-fg-subtle'
        )}
      >
        {selected && <Check className="size-3" strokeWidth={3} />}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
