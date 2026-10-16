import { memo, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Check, Copy } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import './hljs.css'

const remarkPlugins = [remarkGfm]
const rehypePlugins = [[rehypeHighlight, { detect: false, ignoreMissing: true }]] as never

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object' && 'props' in node) return textOf((node.props as { children?: ReactNode }).children)
  return ''
}

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label="Copy"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      className={cn('flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-fg-subtle hover:bg-bg-hover hover:text-fg', className)}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

const components: Components = {
  pre({ children }) {
    const code = textOf(children).replace(/\n$/, '')
    const child = Array.isArray(children) ? children[0] : children
    const cls = (child && typeof child === 'object' && 'props' in child
      ? ((child.props as { className?: string }).className ?? '')
      : '') as string
    const lang = /language-([\w+-]+)/.exec(cls)?.[1]
    return (
      <div className="group/code my-3 overflow-hidden rounded-xl border border-border bg-code-bg font-sans">
        <div className="flex h-8 items-center justify-between border-b border-border/70 pr-1.5 pl-3 text-xs text-fg-subtle">
          <span>{lang ?? 'text'}</span>
          <CopyButton text={code} />
        </div>
        <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-relaxed">{children}</pre>
      </div>
    )
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault()
          if (href && /^https?:|^mailto:/.test(href)) void api.invoke('app:openExternal', href)
        }}
      >
        {children}
      </a>
    )
  },
  img({ src, alt }) {
    return <img src={typeof src === 'string' ? src : undefined} alt={alt ?? ''} className="max-w-full rounded-lg" />
  }
}

export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('cl-md', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
