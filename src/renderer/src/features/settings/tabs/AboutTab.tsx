import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, FolderOpen, RefreshCw, TriangleAlert } from 'lucide-react'
import { api, type AppInfo, type AuthStatus } from '@/lib/api'
import { Button, Row, Section } from '../controls'

function AuthRow({ auth, onRefresh }: { auth: AuthStatus | null; onRefresh: () => void }) {
  const refresh = <Button variant="ghost" onClick={onRefresh}><RefreshCw size={13} />Refresh</Button>
  if (!auth) return <Row label="Claude account" hint="Checking…">{refresh}</Row>
  if (!auth.loggedIn) {
    return (
      <Row
        label="Claude account"
        hint={<span className="flex items-start gap-1.5 text-warning"><TriangleAlert size={13} className="mt-0.5 shrink-0" />
          <span>Not signed in. Run <code className="rounded bg-code-bg px-1 font-mono">claude</code> and then <code className="rounded bg-code-bg px-1 font-mono">/login</code> in a terminal.{auth.error ? ` (${auth.error})` : ''}</span></span>}
      >
        {refresh}
      </Row>
    )
  }
  const plan = auth.subscriptionType ? `Claude ${auth.subscriptionType[0].toUpperCase()}${auth.subscriptionType.slice(1)}` : auth.method === 'api-key' ? 'API key' : 'Signed in'
  return (
    <Row label="Claude account" hint={<span className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-success" />{[auth.email, plan].filter(Boolean).join(' · ')}</span>}>
      {refresh}
    </Row>
  )
}

export function AboutTab() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [auth, setAuth] = useState<AuthStatus | null>(null)

  const loadAuth = useCallback(() => {
    setAuth(null)
    api.invoke('app:getAuthStatus').then(setAuth).catch((e: unknown) => setAuth({ loggedIn: false, error: String(e) }))
  }, [])

  useEffect(() => {
    void api.invoke('app:getInfo').then(setInfo)
    loadAuth()
  }, [loadAuth])

  return (
    <>
      <div className="mb-8 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-xl text-accent-fg">✳︎</div>
        <div>
          <div className="font-serif text-lg text-fg">Claudio</div>
          <div className="text-[12px] text-fg-subtle">Version {info?.version ?? '…'} · Claude Code via your own subscription</div>
        </div>
      </div>
      <Section title="Claude Code">
        <Row label="CLI" hint={info ? (info.claudePath ?? 'Not found in PATH') : 'Loading…'}>
          <span className="font-mono text-[12px] text-fg-muted">{info?.claudeVersion ?? '—'}</span>
        </Row>
        <AuthRow auth={auth} onRefresh={loadAuth} />
      </Section>
      <Section title="Troubleshooting">
        <Row label="Data folder" hint={info?.userDataPath}>
          <Button onClick={() => { if (info) void api.invoke('app:openPath', info.userDataPath) }}><FolderOpen size={13} />Open</Button>
        </Row>
        <Row label="Logs" hint={info?.logsPath}>
          <Button onClick={() => { if (info) void api.invoke('app:openPath', info.logsPath) }}><FolderOpen size={13} />Open logs</Button>
        </Row>
      </Section>
    </>
  )
}
