// Human titles, suggested "always allow" rules and rule matching for tool permission prompts.
import { basename } from 'node:path'

/** Tools whose permission prompt is really a question for the user — never auto-allowed. */
export const INTERACTIVE_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const truncate = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function filePathOf(input: Record<string, unknown>): string {
  return str(input.file_path) || str(input.notebook_path) || str(input.path)
}

export function permissionTitle(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Bash': return `Run: ${truncate(str(input.command).split('\n')[0] ?? '')}`
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit': return `Edit ${basename(filePathOf(input)) || 'file'}`
    case 'Read': return `Read ${basename(filePathOf(input)) || 'file'}`
    case 'WebFetch': return `Fetch ${truncate(str(input.url))}`
    case 'WebSearch': return `Search the web: ${truncate(str(input.query))}`
    case 'Glob':
    case 'Grep': return `Search files: ${truncate(str(input.pattern))}`
    case 'AskUserQuestion': return 'Claude has a question'
    case 'ExitPlanMode': return 'Ready to code?'
    case 'Task':
    case 'Agent': return `Run agent: ${truncate(str(input.description) || 'subagent')}`
  }
  if (toolName.startsWith('mcp__')) {
    const [, server, ...tool] = toolName.split('__')
    return `Use ${tool.join('__')} (${server})`
  }
  return `Use ${toolName}`
}

/** Rule saved when the user picks "always"/"session". */
export function suggestRule(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Bash') {
    const cmd = str(input.command).trim()
    if (!cmd || /[;&|`$<>\n]/.test(cmd)) return cmd ? `Bash(${cmd})` : 'Bash'
    const words = cmd.split(/\s+/)
    const prefix = words.slice(0, Math.min(2, words.length)).join(' ')
    return words.length > 2 ? `Bash(${prefix}:*)` : `Bash(${cmd})`
  }
  if (toolName === 'WebFetch') {
    try { return `WebFetch(domain:${new URL(str(input.url)).hostname})` } catch { return 'WebFetch' }
  }
  return toolName
}

/** Does `rule` (e.g. "Edit", "Bash(npm test:*)", "WebFetch(domain:x.com)") cover this call? */
export function ruleMatches(rule: string, toolName: string, input: Record<string, unknown>): boolean {
  const m = /^([^(]+)(?:\((.*)\))?$/s.exec(rule.trim())
  if (!m) return false
  const [, name, content] = m
  if (name !== toolName) return false
  if (content === undefined || content === '' || content === '*') return true
  if (toolName === 'Bash') {
    const cmd = str(input.command).trim()
    if (content.endsWith(':*')) {
      const prefix = content.slice(0, -2)
      return (cmd === prefix || cmd.startsWith(`${prefix} `)) && !/[;&|`$<>\n]/.test(cmd)
    }
    return cmd === content
  }
  if (toolName === 'WebFetch' && content.startsWith('domain:')) {
    try { return new URL(str(input.url)).hostname === content.slice(7) } catch { return false }
  }
  const path = filePathOf(input)
  if (path && content.endsWith('*')) return path.startsWith(content.slice(0, -1))
  return path === content
}
