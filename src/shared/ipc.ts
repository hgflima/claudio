// Single source of truth for renderer<->main IPC. Do not add channels outside contracts/*.
import type { AppInvoke, AppEvents } from './contracts/app'
import type { SessionsInvoke, SessionsEvents } from './contracts/sessions'
import type { WorkspaceInvoke, WorkspaceEvents } from './contracts/workspace'
import type { McpInvoke, McpEvents } from './contracts/mcp'

export type * from './contracts/app'
export type * from './contracts/sessions'
export type * from './contracts/workspace'
export type * from './contracts/mcp'

export type Invoke = AppInvoke & SessionsInvoke & WorkspaceInvoke & McpInvoke
export type Events = AppEvents & SessionsEvents & WorkspaceEvents & McpEvents
export type InvokeChannel = keyof Invoke
export type EventChannel = keyof Events

export interface ClaudioApi {
  invoke<C extends InvokeChannel>(channel: C, ...args: Parameters<Invoke[C]>): Promise<Awaited<ReturnType<Invoke[C]>>>
  on<E extends EventChannel>(event: E, cb: (payload: Events[E]) => void): () => void
  platform: string
  /** Absolute path of a File dropped/pasted in the renderer (Electron webUtils). */
  pathForFile(file: File): string
}
