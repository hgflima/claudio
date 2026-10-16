import type { ITheme } from '@xterm/xterm'

const LIGHT_ANSI = {
  black: '#1f1e1d', red: '#c0392b', green: '#3f8f5b', yellow: '#b7791f', blue: '#2f6fb3', magenta: '#a0458f', cyan: '#2a8a8a', white: '#9a978f',
  brightBlack: '#6b6a66', brightRed: '#d9534f', brightGreen: '#4fa86c', brightYellow: '#c98a2a', brightBlue: '#4a86c8', brightMagenta: '#b85ca6', brightCyan: '#3aa0a0', brightWhite: '#3a3936'
}
const DARK_ANSI = {
  black: '#3a3936', red: '#e5776b', green: '#7cc48f', yellow: '#e0b562', blue: '#79a8e0', magenta: '#cf8ac0', cyan: '#6cc4c4', white: '#d6d4cc',
  brightBlack: '#85837c', brightRed: '#f08a7e', brightGreen: '#93d6a5', brightYellow: '#ecc77c', brightBlue: '#94bbea', brightMagenta: '#dda2d0', brightCyan: '#88d4d4', brightWhite: '#f5f4ef'
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export function isDark(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}

export function terminalTheme(): ITheme {
  const dark = isDark()
  const accent = cssVar('--color-accent', '#c96442')
  return {
    background: cssVar('--color-bg', dark ? '#262624' : '#faf9f5'),
    foreground: cssVar('--color-fg', dark ? '#f5f4ef' : '#1f1e1d'),
    cursor: accent,
    cursorAccent: cssVar('--color-bg', dark ? '#262624' : '#faf9f5'),
    selectionBackground: dark ? 'rgba(217,119,87,0.35)' : 'rgba(201,100,66,0.25)',
    scrollbarSliderBackground: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
    scrollbarSliderHoverBackground: dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
    ...(dark ? DARK_ANSI : LIGHT_ANSI)
  }
}

export function terminalFontFamily(): string {
  return cssVar('--font-mono', "ui-monospace, 'SF Mono', Menlo, monospace")
}
