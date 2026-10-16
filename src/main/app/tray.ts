// Owner: agent "shell". Menu bar (tray) icon. Follows settings.menuBarEnabled.
import { app, Menu, nativeImage, Tray, type NativeImage } from 'electron'
import { getSettings } from '../core/settings'
import { showQuickEntry } from '../mcp/quick'
import { sendCommand } from './menu'
import { showMainWindow } from './windows'

let tray: Tray | null = null

/** Draws an 8-ray asterisk ("spark") as a 32px @2x template bitmap. */
function sparkIcon(): NativeImage {
  const size = 32, c = (size - 1) / 2, radius = 13, half = 1.35
  const buf = Buffer.alloc(size * size * 4)
  const rays = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c, dy = y - c
      let d = Math.hypot(dx, dy) - 3.2
      for (const a of rays) {
        const ux = Math.cos(a), uy = Math.sin(a)
        const t = Math.max(0, Math.min(radius, dx * ux + dy * uy))
        d = Math.min(d, Math.hypot(dx - t * ux, dy - t * uy) - half * (1 - (t / radius) * 0.45))
      }
      const alpha = Math.max(0, Math.min(1, 0.5 - d))
      buf[(y * size + x) * 4 + 3] = Math.round(alpha * 255)
    }
  }
  const img = nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 })
  img.setTemplateImage(true)
  return img
}

function buildTray(): Tray {
  const t = new Tray(sparkIcon())
  t.setToolTip('Claudio')
  t.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Claudio', click: () => showMainWindow() },
    { label: 'New Session', click: () => sendCommand('new-session') },
    { label: 'Quick Entry', click: () => showQuickEntry() },
    { type: 'separator' },
    { label: 'Quit Claudio', click: () => app.quit() }
  ]))
  return t
}

export function syncTray(): void {
  const enabled = getSettings().menuBarEnabled
  if (enabled && !tray) tray = buildTray()
  else if (!enabled && tray) { tray.destroy(); tray = null }
}
