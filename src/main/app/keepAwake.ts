// Owner: agent "shell" (sole owner of keep-awake). Prevents idle system sleep while sessions run (settings.keepAwake).
import { powerSaveBlocker } from 'electron'
import { bus } from '../core/bus'
import { getSettings, settingsEvents } from '../core/settings'
import { runningSessionsCount } from '../sessions'

const FALLBACK_POLL_MS = 30_000 // safety net in case a turn ends without a bus event

let blockerId: number | null = null

function sync(): void {
  const want = getSettings().keepAwake && runningSessionsCount() > 0
  if (want && blockerId === null) blockerId = powerSaveBlocker.start('prevent-app-suspension')
  else if (!want && blockerId !== null) {
    if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId)
    blockerId = null
  }
}

/** Bus events may fire before sessions-core updates its running count — re-check on the next tick. */
function syncSoon(): void {
  sync()
  setImmediate(sync)
}

export function registerKeepAwake(): void {
  settingsEvents.on('changed', sync)
  for (const ev of ['session:turn-started', 'session:turn-finished', 'session:error', 'session:changed', 'session:removed'] as const) bus.onBus(ev, syncSoon)
  setInterval(sync, FALLBACK_POLL_MS).unref()
}
