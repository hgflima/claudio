// Renderer command bus (orchestrator-owned). Shell's AppEffects publishes menu commands here;
// features subscribe to the commands they implement.
import type { MenuCommand } from '@shared/ipc'

type Handler = (cmd: MenuCommand) => void
const handlers = new Set<Handler>()

export const commands = {
  publish(cmd: MenuCommand): void { for (const h of handlers) h(cmd) },
  subscribe(h: Handler): () => void { handlers.add(h); return () => { handlers.delete(h) } }
}
