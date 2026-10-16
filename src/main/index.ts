// Claudio main entry (orchestrator-owned). Each domain exposes a register*() and owns its folder.
import { app } from 'electron'
import { log } from './core/log'
import { getShellEnv } from './core/shellEnv'
import { registerApp } from './app'
import { createMainWindow, showMainWindow } from './app/windows'
import { registerSessions, stopAllSessions } from './sessions'
import { registerWorkspace } from './workspace'
import { registerMcp } from './mcp'
import { registerQuickEntry } from './mcp/quick'

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setName('Claudio')
  app.on('second-instance', () => showMainWindow())

  app.whenReady().then(async () => {
    void getShellEnv() // warm up PATH resolution
    registerApp()
    registerSessions()
    registerWorkspace()
    registerMcp()
    createMainWindow()
    registerQuickEntry()
    log.info(`[main] Claudio ${app.getVersion()} ready`)
  })

  app.on('activate', () => showMainWindow())
  app.on('will-quit', () => stopAllSessions())
  // Closing all windows does not quit (tray/dock keep running) — see app/index.ts for quit flow.
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
