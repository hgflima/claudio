// Typed IPC helpers. Every main module registers handlers via `handle` and broadcasts via `emit`.
import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import type { Events, EventChannel, Invoke, InvokeChannel } from '@shared/ipc'
import { log } from './log'

export function handle<C extends InvokeChannel>(
  channel: C,
  fn: (...args: Parameters<Invoke[C]>) => ReturnType<Invoke[C]> | Promise<Awaited<ReturnType<Invoke[C]>>>
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return await fn(...(args as Parameters<Invoke[C]>))
    } catch (err) {
      log.error(`[ipc] ${channel} failed`, err)
      throw err
    }
  })
}

/** Broadcast to every window. */
export function emit<E extends EventChannel>(event: E, payload: Events[E]): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(event, payload)
}

/** Send to a single webContents. */
export function emitTo<E extends EventChannel>(wc: WebContents, event: E, payload: Events[E]): void {
  if (!wc.isDestroyed()) wc.send(event, payload)
}
