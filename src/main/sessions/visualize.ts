// In-process MCP server "visualize": the UI renders show_widget's widget_code from the tool_use input.
import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { loadSdk } from './sdk'

const DESCRIPTION = [
  'Render an inline visual widget in the chat: charts, diagrams, data tables, timelines, UI mockups, small interactive explainers.',
  'Use it when a picture explains better than prose; do not use it for plain text answers.',
  'widget_code is ONE self-contained document: either an <svg>…</svg> element, or an HTML fragment/page with inline <style> and <script>.',
  'It runs in a sandboxed iframe with NO network access: no external scripts, fonts, images or fetch — inline everything (data, SVG, CSS, JS).',
  'Design for a width of about 680px (responsive down to 360px); height grows with content, keep it under ~800px.',
  'Theme: use the CSS variables --bg, --fg, --fg-muted, --border, --accent and --code-bg (they follow light/dark mode) instead of hard-coded colors, with sensible fallbacks, e.g. color: var(--fg, #1f1e1d).',
  'Keep it clean: system-ui font, generous spacing, rounded corners, subtle borders.',
  'The user sees the rendered widget, not the code, so do not repeat the code in your reply; briefly describe what it shows if useful.'
].join(' ')

/** A fresh instance per query: an MCP server instance binds to a single transport. */
export async function createVisualizeServer(): Promise<McpSdkServerConfigWithInstance> {
  const { createSdkMcpServer, tool } = await loadSdk()
  return createSdkMcpServer({
    name: 'visualize',
    version: '1.0.0',
    tools: [
      tool(
        'show_widget',
        DESCRIPTION,
        {
          title: z.string().describe('Short title shown above the widget'),
          widget_code: z.string().describe('Self-contained SVG (starting with <svg) or HTML'),
          loading_messages: z.array(z.string()).optional().describe('Optional short status lines shown while the widget is generated')
        },
        async () => ({ content: [{ type: 'text', text: 'Widget rendered' }] }),
        { annotations: { readOnlyHint: true } }
      )
    ]
  })
}

/** MCP tools allowed without a prompt. */
export function isAutoApprovedMcpTool(toolName: string): boolean {
  return toolName.startsWith('mcp__visualize__') || toolName.startsWith('mcp__scheduled-tasks__list')
}
