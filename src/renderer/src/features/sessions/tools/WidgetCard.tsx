import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, LayoutDashboard, LoaderCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { asRecord, str } from '../util'
import { CopyButton } from '../transcript/Markdown'

export const WIDGET_TOOL = 'mcp__visualize__show_widget'

const THEME_VARS = [
  'bg', 'bg-elevated', 'bg-hover', 'fg', 'fg-muted', 'fg-subtle', 'border', 'accent', 'accent-fg',
  'success', 'warning', 'danger', 'code-bg'
]

function useThemeKey(): string {
  const [key, setKey] = useState(() => document.documentElement.dataset.theme ?? '')
  useEffect(() => {
    const mo = new MutationObserver(() => setKey(document.documentElement.dataset.theme ?? ''))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])
  return key
}

function themeCss(): string {
  const cs = getComputedStyle(document.documentElement)
  const vars = THEME_VARS.map((v) => {
    const val = cs.getPropertyValue(`--color-${v}`).trim()
    return `--color-${v}:${val};--${v}:${val};`
  }).join('')
  const font = (n: string) => cs.getPropertyValue(`--font-${n}`).trim()
  return `:root{${vars}--font-sans:${font('sans')};--font-serif:${font('serif')};--font-mono:${font('mono')};color-scheme:${
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  }}html,body{margin:0;padding:0;height:auto;min-height:0;background:transparent;color:var(--color-fg);font-family:var(--font-sans);font-size:14px;line-height:1.5}` +
    `*{box-sizing:border-box}#__cw{display:flow-root;padding:2px}svg{max-width:100%}svg text:not([fill]){fill:currentColor}`
}

// Measures the content wrapper (not <html>, whose scrollHeight never drops below the iframe viewport).
const HEIGHT_SCRIPT = `<script>(function(){
var w=document.getElementById('__cw'),last=-1;
function r(){var h=Math.ceil(w.getBoundingClientRect().height);if(h!==last){last=h;parent.postMessage({__claudioWidget:1,h:h},'*')}}
try{new ResizeObserver(r).observe(w)}catch(e){}
addEventListener('load',r);
document.addEventListener('load',r,true);
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(r);
r();setTimeout(r,250);
})()</script>`

function buildDoc(code: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${themeCss()}</style></head><body><div id="__cw">${code}</div>${HEIGHT_SCRIPT}</body></html>`
}

interface Props {
  input: unknown
  pending: boolean
  error?: string
}

export function WidgetCard({ input: raw, pending, error }: Props) {
  const input = asRecord(raw)
  const code = str(input.widget_code)
  const title = str(input.title) || 'Widget'
  const loading = Array.isArray(input.loading_messages) ? (input.loading_messages as unknown[]).map(str).filter(Boolean) : []
  const themeKey = useThemeKey()
  const doc = useMemo(() => buildDoc(code), [code, themeKey])
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(48)
  const [tick, setTick] = useState(0)
  const reported = useRef(false)
  const [url, setUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Served from an isolated claudio-widget:// origin whose CSP header allows inline scripts (srcdoc would inherit the app CSP).
  useEffect(() => {
    if (pending || !code) return
    let alive = true
    setLoadError(null)
    api
      .invoke('widget:create', doc)
      .then((u) => {
        if (!alive) return
        reported.current = false
        setUrl(u)
      })
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [pending, code, doc])

  // Safety net if the widget never reports its height.
  useEffect(() => {
    if (!url) return
    const t = setTimeout(() => !reported.current && setHeight(360), 2500)
    return () => clearTimeout(t)
  }, [url])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return
      const d = e.data as { __claudioWidget?: number; h?: number } | null
      if (!d?.__claudioWidget || typeof d.h !== 'number') return
      reported.current = true
      setHeight(Math.max(24, Math.min(d.h, 2000)))
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    if (!pending || loading.length < 2) return
    const t = setInterval(() => setTick((n) => n + 1), 2200)
    return () => clearInterval(t)
  }, [pending, loading.length])

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated/60">
      <div className="flex items-center gap-2 border-b border-border/70 py-1.5 pr-1.5 pl-3 text-[13px]">
        <LayoutDashboard className="size-3.5 shrink-0 text-fg-muted" />
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        {error && <CircleAlert className="size-3.5 shrink-0 text-danger" />}
        {code && <CopyButton text={code} />}
      </div>
      {pending ? (
        <div className="flex items-center gap-2 px-3 py-6 text-[13px] text-fg-subtle">
          <LoaderCircle className="size-3.5 animate-spin" />
          <span className="animate-pulse">{loading.length ? loading[tick % loading.length] : 'Building widget…'}</span>
        </div>
      ) : code && url ? (
        <iframe
          ref={frame}
          title={title}
          sandbox="allow-scripts"
          src={url}
          style={{ height }}
          className="block w-full border-0 bg-transparent"
        />
      ) : code && !loadError ? (
        <div className="flex items-center gap-2 px-3 py-6 text-[13px] text-fg-subtle">
          <LoaderCircle className="size-3.5 animate-spin" /> Loading widget…
        </div>
      ) : null}
      {loadError && <div className="px-3 py-2 font-mono text-xs whitespace-pre-wrap text-danger">{loadError}</div>}
      {error && <div className="border-t border-border/70 px-3 py-2 font-mono text-xs whitespace-pre-wrap text-danger">{error}</div>}
    </div>
  )
}
