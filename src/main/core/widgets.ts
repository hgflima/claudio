// Orchestrator-owned. Serves model-generated widget HTML from an isolated origin (claudio-widget://w/<id>)
// with its own CSP. srcdoc iframes would inherit the app's strict CSP and block inline scripts.
import { protocol } from 'electron'
import { randomUUID } from 'node:crypto'
import { handle } from './ipc'

const SCHEME = 'claudio-widget'
const MAX = 200
const docs = new Map<string, string>()

const CSP = "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://esm.sh; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data: blob:; connect-src 'none'; form-action 'none'; frame-src 'none'"

/** Must run before app 'ready'. */
export function registerWidgetScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: false } }])
}

/** Call after app 'ready'. */
export function registerWidgets(): void {
  protocol.handle(SCHEME, (req) => {
    const id = new URL(req.url).pathname.replace(/^\//, '')
    const html = docs.get(id)
    if (!html) return new Response('Not found', { status: 404 })
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP, 'cache-control': 'no-store' } })
  })
  handle('widget:create', (html) => {
    if (typeof html !== 'string' || html.length > 2_000_000) throw new Error('Invalid widget')
    const id = randomUUID()
    docs.set(id, html)
    if (docs.size > MAX) docs.delete(docs.keys().next().value as string)
    return `${SCHEME}://w/${id}`
  })
}
