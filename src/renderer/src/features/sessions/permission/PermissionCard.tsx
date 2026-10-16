import { useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { PermissionRequest, PermissionResponse } from '@shared/ipc'
import { errMsg, respondPermission } from '../store'
import { Button } from '../ui/Dialog'
import { describeTool, EditDiff, Json, Pre } from '../tools/describe'
import { Markdown } from '../transcript/Markdown'
import { str } from '../util'
import { AskUserQuestionCard } from './AskUserQuestion'

type Respond = (r: Omit<PermissionResponse, 'sessionId' | 'requestId'>) => void

export function PermissionCard({ request, cwd, queued }: { request: PermissionRequest; cwd: string | null; queued: number }) {
  const [error, setError] = useState<string | null>(null)
  const respond: Respond = (r) => {
    setError(null)
    respondPermission({ sessionId: request.sessionId, requestId: request.requestId, ...r }).catch((e) => setError(errMsg(e)))
  }
  const inner =
    request.toolName === 'AskUserQuestion' ? (
      <AskUserQuestionCard request={request} respond={respond} />
    ) : request.toolName === 'ExitPlanMode' ? (
      <PlanCard request={request} respond={respond} />
    ) : (
      <ToolPermission request={request} cwd={cwd} respond={respond} />
    )
  return (
    <div className="rounded-2xl border border-accent/40 bg-bg-elevated shadow-sm">
      {inner}
      {(error || queued > 1) && (
        <div className="flex justify-between border-t border-border px-4 py-1.5 text-xs">
          <span className="text-danger">{error}</span>
          {queued > 1 && <span className="text-fg-subtle">{queued - 1} more pending</span>}
        </div>
      )}
    </div>
  )
}

function ToolPermission({ request, cwd, respond }: { request: PermissionRequest; cwd: string | null; respond: Respond }) {
  const [reason, setReason] = useState('')
  const allowRef = useRef<HTMLButtonElement>(null)
  const view = describeTool(request.toolName, request.input, { cwd })
  const input = request.input

  useEffect(() => {
    if (document.activeElement?.tagName !== 'TEXTAREA') allowRef.current?.focus()
  }, [request.requestId])

  const deny = () => respond({ decision: 'deny', scope: 'once', message: reason.trim() || undefined })

  let details: React.ReactNode
  if (request.toolName === 'Bash') details = <Pre>{str(input.command)}</Pre>
  else if (['Edit', 'MultiEdit', 'Write'].includes(request.toolName)) details = <EditDiff name={request.toolName} input={input} />
  else if (view.body) details = view.body
  else if (Object.keys(input).length) details = <Json value={input} />

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
        <div className="min-w-0">
          <div className="text-[14px] font-medium">{request.title ?? `Allow Claude to use ${view.label}?`}</div>
          {view.summary && request.toolName !== 'Bash' && (
            <div className="truncate font-mono text-xs text-fg-muted">{view.summary}</div>
          )}
          {request.toolName === 'Bash' && str(input.description) && (
            <div className="text-xs text-fg-muted">{str(input.description)}</div>
          )}
        </div>
      </div>
      {details && <div className="max-h-64 overflow-auto">{details}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <Button ref={allowRef} variant="primary" onClick={() => respond({ decision: 'allow', scope: 'once' })}>
          Allow once <kbd className="font-sans text-[11px] opacity-60">↵</kbd>
        </Button>
        <Button onClick={() => respond({ decision: 'allow', scope: 'session' })}>Allow for session</Button>
        <Button onClick={() => respond({ decision: 'allow', scope: 'always' })} title={request.suggestedRule}>
          Always allow
          {request.suggestedRule && <code className="max-w-48 truncate font-mono text-[11px] text-fg-muted">{request.suggestedRule}</code>}
        </Button>
        <Button variant="ghost" className="text-danger hover:text-danger" onClick={deny}>
          Deny
        </Button>
      </div>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            deny()
          }
        }}
        placeholder="Deny with a note: tell Claude what to do instead (optional)"
        className="h-8 rounded-lg border border-border bg-bg px-2.5 text-[13px] outline-none placeholder:text-fg-subtle focus:border-fg-subtle"
      />
    </div>
  )
}

function PlanCard({ request, respond }: { request: PermissionRequest; respond: Respond }) {
  const [feedback, setFeedback] = useState('')
  const plan = str(request.input.plan)
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="text-[14px] font-medium">Ready to code? Here is Claude’s plan:</div>
      <div className="max-h-[45vh] overflow-auto rounded-xl border border-border bg-bg px-4 py-3">
        {plan ? <Markdown text={plan} className="font-serif text-[14.5px]" /> : <span className="text-fg-subtle">No plan text.</span>}
      </div>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={1}
        placeholder="What should Claude change? (optional, for Keep planning)"
        className="resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none placeholder:text-fg-subtle focus:border-fg-subtle"
      />
      <div className="flex gap-2">
        <Button autoFocus variant="primary" onClick={() => respond({ decision: 'allow', scope: 'once' })}>
          Approve plan
        </Button>
        <Button
          onClick={() =>
            respond({
              decision: 'deny',
              scope: 'once',
              message: feedback.trim() || 'The user wants to keep planning. Refine the plan before writing code.'
            })
          }
        >
          Keep planning
        </Button>
      </div>
    </div>
  )
}
