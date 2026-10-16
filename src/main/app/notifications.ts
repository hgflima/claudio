// Owner: agent "shell". OS notifications for session events (only when the app isn't focused).
import { app, Notification } from 'electron'
import { bus } from '../core/bus'
import { emit } from '../core/ipc'
import { getSettings } from '../core/settings'
import { getMainWindow, showMainWindow } from './windows'

export type NotifyKind = 'permission' | 'done' | 'error'
export interface NotifyInput { title: string; body: string; sessionId?: string; kind: NotifyKind }

const live = new Set<Notification>() // keep references so click handlers survive GC

const clip = (s: string, n = 180): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function showNotification(n: NotifyInput): void {
  const s = getSettings()
  if (s.notifications[n.kind] === 'off' || !Notification.isSupported()) return
  const notification = new Notification({ title: clip(n.title, 80), body: clip(n.body), silent: !s.notificationSound })
  live.add(notification)
  const release = (): void => { live.delete(notification) }
  notification.on('click', () => {
    release()
    showMainWindow()
    if (n.sessionId) emit('app:navigate', { sessionId: n.sessionId })
  })
  notification.on('close', release)
  notification.show()
  if (n.kind === 'permission' && process.platform === 'darwin') app.dock?.bounce('informational')
}

function appFocused(): boolean {
  const w = getMainWindow()
  return !!w && w.isVisible() && w.isFocused()
}

function notifyIfBackground(n: NotifyInput): void {
  if (!appFocused()) showNotification(n)
}

export function registerNotifications(): void {
  bus.onBus('session:turn-finished', ({ session, isError, summary }) => notifyIfBackground({
    kind: 'done', sessionId: session.id, title: session.title || 'Claudio',
    body: summary?.trim() || (isError ? 'Claude stopped with an error.' : 'Claude finished working.')
  }))
  bus.onBus('session:permission-requested', ({ session, request }) => notifyIfBackground({
    kind: 'permission', sessionId: session.id, title: 'Permission needed',
    body: `${session.title || 'Session'} — ${request.title ?? request.toolName}`
  }))
  bus.onBus('session:error', ({ session, error }) => notifyIfBackground({
    kind: 'error', sessionId: session.id, title: session.title || 'Claudio', body: error || 'Something went wrong.'
  }))
}
