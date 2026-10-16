// In-process event bus between main modules (orchestrator-owned). Keeps domains decoupled.
import { EventEmitter } from 'node:events'
import type { PermissionRequest, SessionMeta } from '@shared/ipc'

export interface BusEvents {
  'session:turn-finished': { session: SessionMeta; isError: boolean; summary?: string } // sessions-core emits; shell notifies
  'session:permission-requested': { session: SessionMeta; request: PermissionRequest } // sessions-core emits; shell notifies
  'session:error': { session: SessionMeta; error: string }
  'mcp:config-changed': void // mcp-quick emits; sessions-core may use it for new sessions
}

class Bus extends EventEmitter {
  emitBus<K extends keyof BusEvents>(k: K, p: BusEvents[K]): void { this.emit(k, p) }
  onBus<K extends keyof BusEvents>(k: K, fn: (p: BusEvents[K]) => void): () => void { this.on(k, fn); return () => this.off(k, fn) }
}
export const bus = new Bus()
