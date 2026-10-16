// Typed IPC client. Usage: await api.invoke('sessions:list'); const off = api.on('sessions:changed', cb)
export const api = window.claudio
export type * from '@shared/ipc'
