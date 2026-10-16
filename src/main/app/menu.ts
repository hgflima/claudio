// Owner: agent "shell". Native application menu. Action items forward MenuCommand to the renderer.
import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import type { MenuCommand } from '@shared/ipc'
import { emit } from '../core/ipc'
import { log } from '../core/log'
import { openExternalSafe, showMainWindow } from './windows'

export function sendCommand(cmd: MenuCommand): void {
  showMainWindow()
  emit('menu:command', cmd)
}

const cmd = (label: string, command: MenuCommand, accelerator?: string): MenuItemConstructorOptions =>
  ({ label, accelerator, click: () => sendCommand(command) })

export function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        cmd('Settings…', 'open-settings', 'CmdOrCtrl+,'),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    } satisfies MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        cmd('New Session', 'new-session', 'CmdOrCtrl+N'),
        cmd('New Chat', 'new-chat', 'CmdOrCtrl+Shift+N'),
        cmd('Open Folder…', 'open-folder', 'CmdOrCtrl+O'),
        { type: 'separator' },
        cmd('Close Session', 'close-session', 'CmdOrCtrl+W'),
        cmd('Reopen Closed Session', 'reopen-closed-session', 'CmdOrCtrl+Shift+T'),
        ...(isMac ? [] : [{ type: 'separator' }, cmd('Settings…', 'open-settings', 'CmdOrCtrl+,'), { role: 'quit' }] satisfies MenuItemConstructorOptions[])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' },
        { type: 'separator' },
        cmd('Find…', 'find', 'CmdOrCtrl+F')
      ]
    },
    {
      label: 'View',
      submenu: [
        cmd('Command Palette…', 'command-palette', 'CmdOrCtrl+K'),
        cmd('Toggle Sidebar', 'toggle-sidebar', 'CmdOrCtrl+B'),
        cmd('Terminal', 'toggle-terminal', 'Ctrl+`'),
        cmd('Changes', 'toggle-changes', 'CmdOrCtrl+Shift+D'),
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'reload' }, { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Go',
      submenu: [
        cmd('Next Session', 'next-session', 'CmdOrCtrl+Shift+]'),
        cmd('Previous Session', 'prev-session', 'CmdOrCtrl+Shift+['),
        { type: 'separator' },
        cmd('Focus Composer', 'focus-composer', 'CmdOrCtrl+L'),
        cmd('Stop Response', 'interrupt', 'CmdOrCtrl+.')
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        { type: 'separator' },
        { label: 'Show Main Window', click: () => showMainWindow() },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] satisfies MenuItemConstructorOptions[] : [{ role: 'close' }] satisfies MenuItemConstructorOptions[])
      ]
    },
    {
      role: 'help',
      submenu: [
        { label: 'Claude Code Documentation', click: () => openExternalSafe('https://docs.claude.com/en/docs/claude-code/overview') },
        { type: 'separator' },
        { label: 'Show Logs in Finder', click: () => { void shell.openPath(log.dir()) } }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
