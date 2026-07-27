// Gera os ícones PNG do PWA (balão de conversa branco sobre gradiente verde)
// sem depender de nenhuma biblioteca externa. Rode com: npm run icons
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function png(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let o = 0
  for (let y = 0; y < size; y++) {
    raw[o++] = 0 // filtro "none"
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelFn(x, y, size)
      raw[o++] = r; raw[o++] = g; raw[o++] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2 // 8 bits, truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function inRoundedRect(x, y, rx, ry, w, h, r) {
  if (x < rx || x > rx + w || y < ry || y > ry + h) return false
  const cx = Math.max(rx + r, Math.min(x, rx + w - r))
  const cy = Math.max(ry + r, Math.min(y, ry + h - r))
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r || (x >= rx + r && x <= rx + w - r) || (y >= ry + r && y <= ry + h - r)
}

function pixel(x, y, size) {
  const t = y / size
  // gradiente verde estilo iMessage
  const bg = [
    Math.round(52 + (22 - 52) * t),
    Math.round(199 + (163 - 199) * t),
    Math.round(89 + (74 - 89) * t),
  ]
  const s = size
  // balão: retângulo arredondado central
  const bx = s * 0.18, by = s * 0.24, bw = s * 0.64, bh = s * 0.44, br = s * 0.16
  // rabinho do balão (triângulo)
  const tail =
    y > by + bh - 1 && y < by + bh + s * 0.12 &&
    x > s * 0.30 && x < s * 0.30 + (by + bh + s * 0.12 - y) * 1.2
  if (inRoundedRect(x, y, bx, by, bw, bh, br) || tail) {
    // três pontinhos verdes dentro do balão
    const dotY = by + bh / 2
    for (let i = 0; i < 3; i++) {
      const dotX = s * (0.34 + i * 0.16)
      if ((x - dotX) ** 2 + (y - dotY) ** 2 <= (s * 0.045) ** 2) return bg
    }
    return [255, 255, 255]
  }
  return bg
}

mkdirSync('public/icons', { recursive: true })
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`public/icons/${file}`, png(size, pixel))
  console.log(`gerado public/icons/${file}`)
}
