// Owner: agent "shell". Detects installed code editors and opens paths in them.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { shell } from 'electron'
import { getSettings } from '../core/settings'
import { log } from '../core/log'

interface EditorDef { id: string; name: string; apps: string[]; bundleIds: string[] }
interface Editor { id: string; name: string; appPath: string }

const EDITORS: EditorDef[] = [
  { id: 'vscode', name: 'VS Code', apps: ['Visual Studio Code'], bundleIds: ['com.microsoft.VSCode'] },
  { id: 'cursor', name: 'Cursor', apps: ['Cursor'], bundleIds: ['com.todesktop.230313mzl4w4u92'] },
  { id: 'windsurf', name: 'Windsurf', apps: ['Windsurf'], bundleIds: ['com.exafunction.windsurf'] },
  { id: 'zed', name: 'Zed', apps: ['Zed'], bundleIds: ['dev.zed.Zed'] },
  { id: 'xcode', name: 'Xcode', apps: ['Xcode'], bundleIds: ['com.apple.dt.Xcode'] },
  { id: 'sublime', name: 'Sublime Text', apps: ['Sublime Text'], bundleIds: ['com.sublimetext.4', 'com.sublimetext.3'] },
  { id: 'fleet', name: 'Fleet', apps: ['Fleet'], bundleIds: ['com.jetbrains.fleet'] },
  { id: 'intellij', name: 'IntelliJ IDEA', apps: ['IntelliJ IDEA', 'IntelliJ IDEA CE', 'IntelliJ IDEA Ultimate'], bundleIds: ['com.jetbrains.intellij', 'com.jetbrains.intellij.ce'] }
]

const run = (cmd: string, args: string[], timeout = 4000): Promise<string> =>
  new Promise((resolve) => execFile(cmd, args, { timeout }, (err, stdout) => resolve(err ? '' : stdout)))

async function locate(def: EditorDef): Promise<string | null> {
  for (const dir of ['/Applications', join(homedir(), 'Applications')]) {
    for (const name of def.apps) {
      const p = join(dir, `${name}.app`)
      if (existsSync(p)) return p
    }
  }
  for (const id of def.bundleIds) {
    const hit = (await run('mdfind', [`kMDItemCFBundleIdentifier == '${id}'`])).split('\n').find((l) => l.endsWith('.app'))
    if (hit) return hit
  }
  return null
}

let cache: { at: number; editors: Promise<Editor[]> } | null = null

export function detectEditors(): Promise<Editor[]> {
  if (process.platform !== 'darwin') return Promise.resolve([])
  if (!cache || Date.now() - cache.at > 60_000) {
    cache = {
      at: Date.now(),
      editors: Promise.all(EDITORS.map(async (d) => {
        const appPath = await locate(d)
        return appPath ? { id: d.id, name: d.name, appPath } : null
      })).then((list) => list.filter((e): e is Editor => !!e))
    }
  }
  return cache.editors
}

export async function listEditors(): Promise<{ id: string; name: string }[]> {
  return (await detectEditors()).map(({ id, name }) => ({ id, name }))
}

export async function openInEditor(path: string, editorId?: string): Promise<void> {
  const editors = await detectEditors()
  const wanted = editorId || getSettings().preferredEditor
  const editor = editors.find((e) => e.id === wanted) ?? editors[0]
  if (!editor) { await shell.openPath(path); return }
  await new Promise<void>((resolve, reject) =>
    execFile('open', ['-a', editor.appPath, path], (err) => {
      if (err) { log.warn('[editors] open failed', String(err)); reject(new Error(`Could not open ${editor.name}`)) } else resolve()
    }))
}
