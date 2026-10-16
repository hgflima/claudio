// Owner: agent "shell". Help › Troubleshooting actions.
import { app, clipboard, dialog, session, shell } from 'electron'
import { arch, release } from 'node:os'
import { log } from '../core/log'
import { resolveClaudePath } from '../core/shellEnv'
import { claudeVersion } from './claudeCli'
import { requestResetOnRelaunch } from './early'
import { getMainWindow } from './windows'

function relaunch(): void {
  app.relaunch()
  app.quit()
}

async function message(opts: Electron.MessageBoxOptions): Promise<number> {
  const win = getMainWindow()
  return (win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)).response
}

export function showLogs(): void { void shell.openPath(log.dir()) }

export async function copyDiagnostics(): Promise<void> {
  const lines = [
    `Claudio ${app.getVersion()}${app.isPackaged ? '' : ' (dev)'}`,
    `Electron ${process.versions.electron} · Chrome ${process.versions.chrome} · Node ${process.versions.node}`,
    `OS ${process.platform} ${release()} (${arch()})`,
    `claude CLI ${(await claudeVersion()) ?? 'unknown'} at ${(await resolveClaudePath()) ?? 'not found'}`,
    `userData ${app.getPath('userData')}`,
    `logs ${log.dir()}`
  ]
  clipboard.writeText(lines.join('\n'))
  await message({ type: 'info', message: 'Diagnostic info copied to the clipboard.', detail: lines.join('\n'), buttons: ['OK'] })
}

export async function clearCacheAndRestart(): Promise<void> {
  const ok = await message({
    type: 'question', buttons: ['Clear and Restart', 'Cancel'], defaultId: 0, cancelId: 1,
    message: 'Clear cache and restart Claudio?', detail: 'Sessions and settings are kept.'
  })
  if (ok !== 0) return
  await session.defaultSession.clearCache()
  await session.defaultSession.clearCodeCaches({})
  relaunch()
}

export async function resetAppData(): Promise<void> {
  const choice = await message({
    type: 'warning', buttons: ['Reset, Keep Sessions', 'Reset Everything', 'Cancel'], defaultId: 2, cancelId: 2,
    message: 'Reset Claudio’s app data?',
    detail: 'Settings, window state and caches are deleted and Claudio restarts. Choose whether to keep your sessions. Your ~/.claude configuration is never touched.'
  })
  if (choice === 2) return
  requestResetOnRelaunch(choice === 0)
  relaunch()
}
