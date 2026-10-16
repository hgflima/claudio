// Orchestrator-owned. Generic typed bridge; do not add per-feature APIs here.
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ClaudioApi } from '@shared/ipc'

const api: ClaudioApi = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (event, cb) => {
    const listener = (_e: unknown, payload: unknown) => cb(payload as never)
    ipcRenderer.on(event, listener)
    return () => { ipcRenderer.removeListener(event, listener) }
  },
  platform: process.platform,
  pathForFile: (file) => webUtils.getPathForFile(file)
}
contextBridge.exposeInMainWorld('claudio', api)
