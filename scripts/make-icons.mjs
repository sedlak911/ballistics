// Draws the header logo (Logo() in src/components/AppHeader.tsx) into the install icons under public/icons/.
// Deterministic: the same script gives the same bytes. Only node:fs and node:zlib. Run with `npm run icons`.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
const BG = [0x0b, 0x0d, 0x0e]
const FG = [0x3c, 0xc8, 0xd8]
const STROKE = 1.5
const HALF = STROKE / 2
const SS = 4 // 4x4 supersampling

// The logo in its 34-unit box: butt caps and square corners, as in the SVG.
const ticks = [[17 - HALF, 4, 17 + HALF, 12], [17 - HALF, 22, 17 + HALF, 30], [4, 17 - HALF, 12, 17 + HALF], [22, 17 - HALF, 30, 17 + HALF]]
// Whether a point of the 34-unit box is inked.
function inked(x, y) {
  const square = Math.max(Math.abs(x - 17), Math.abs(y - 17)) // the outline is a square band around 16
  if (square >= 16 - HALF && square <= 16 + HALF) return true
  for (const [x1, y1, x2, y2] of ticks) if (x >= x1 && x <= x2 && y >= y1 && y <= y2) return true
  if (Math.abs(Math.hypot(x - 17, y - 17) - 9) <= HALF) return true
  return Math.hypot(x - 17, y - 17) <= 1.6
}

function render(side, share) {
  const scale = (side * share) / 34
  const offset = (side - 34 * scale) / 2
  const raw = Buffer.alloc(side * (side * 3 + 1)) // filter byte 0 starts each row
  for (let y = 0; y < side; y++) {
    const row = y * (side * 3 + 1)
    for (let x = 0; x < side; x++) {
      let hits = 0
      for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
        if (inked((x + (i + 0.5) / SS - offset) / scale, (y + (j + 0.5) / SS - offset) / scale)) hits++
      }
      const a = hits / (SS * SS)
      for (let c = 0; c < 3; c++) raw[row + 1 + x * 3 + c] = Math.round(BG[c] + (FG[c] - BG[c]) * a)
    }
  }
  return raw
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0)
  return Buffer.concat([head, data, crc])
}

function png(side, share) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(side, 0)
  ihdr.writeUInt32BE(side, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(render(side, share), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT, { recursive: true })
for (const [name, side, share] of [
  ['icon-192.png', 192, 0.7],
  ['icon-512.png', 512, 0.7],
  ['icon-maskable-512.png', 512, 0.56], // inside the 80% safe circle
  ['apple-touch-icon.png', 180, 0.7],
]) writeFileSync(join(OUT, name), png(side, share))
console.log('make-icons: wrote 4 icons to public/icons/')
