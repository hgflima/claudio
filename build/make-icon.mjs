// Draws Claudio's app icon (orange 8-ray asterisk on a cream macOS squircle) as a 1024px PNG.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const S = 1024
const out = process.argv[2]
const CREAM = [0xfa, 0xf9, 0xf5], ORANGE = [0xd9, 0x77, 0x57], EDGE = [0xe6, 0xe2, 0xd6]

// macOS icon grid: 824px body centered, superellipse n≈5.
const C = S / 2, R = 412, N = 5
function squircleSdf(x, y) {
  const dx = Math.abs(x - C) / R, dy = Math.abs(y - C) / R
  const v = Math.pow(Math.pow(dx, N) + Math.pow(dy, N), 1 / N)
  return (v - 1) * R // approx signed distance in px
}
const rays = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4 + Math.PI / 8)
const RAY_LEN = 270, BASE_W = 46, TIP_W = 22, CORE = 70
function sparkSdf(x, y) {
  const dx = x - C, dy = y - C
  let d = Math.hypot(dx, dy) - CORE
  for (const a of rays) {
    const ux = Math.cos(a), uy = Math.sin(a)
    const t = Math.max(0, Math.min(RAY_LEN, dx * ux + dy * uy))
    const w = BASE_W + (TIP_W - BASE_W) * (t / RAY_LEN)
    d = Math.min(d, Math.hypot(dx - t * ux, dy - t * uy) - w)
  }
  return d
}
const cov = (d) => Math.max(0, Math.min(1, 0.5 - d))
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

const raw = Buffer.alloc(S * (S * 4 + 1))
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0
  for (let x = 0; x < S; x++) {
    const px = x + 0.5, py = y + 0.5
    const sq = squircleSdf(px, py)
    const shadow = 0.22 * Math.max(0, Math.min(1, 1 - squircleSdf(px, py - 10) / 24)) // soft drop shadow
    let rgb = mix(CREAM, EDGE, Math.max(0, Math.min(1, (sq + 6) / 6))) // subtle rim
    rgb = mix(rgb, ORANGE, cov(sparkSdf(px, py)))
    const body = cov(sq)
    const alpha = body + shadow * (1 - body)
    const color = alpha > 0 ? rgb.map((v) => (v * body) / alpha) : [0, 0, 0]
    const o = y * (S * 4 + 1) + 1 + x * 4
    raw[o] = Math.round(color[0]); raw[o + 1] = Math.round(color[1]); raw[o + 2] = Math.round(color[2]); raw[o + 3] = Math.round(alpha * 255)
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6
writeFileSync(out, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]))
console.log('wrote', out)
