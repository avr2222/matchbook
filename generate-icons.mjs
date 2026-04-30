// node generate-icons.mjs  — no external deps required
import { deflateSync } from 'zlib'
import { writeFileSync } from 'fs'

function u32(n) {
  const b = Buffer.allocUnsafe(4)
  b.writeUInt32BE(n, 0)
  return b
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = u32(data.length)
  const crcData = Buffer.concat([typeBuf, data])
  return Buffer.concat([len, typeBuf, data, u32(crc32(crcData))])
}

function makePNG(size) {
  // Green background  #16a34a = rgb(22, 163, 74)
  const BG  = [22, 163, 74]
  // White border ring
  const W   = [255, 255, 255]

  const rows = []
  for (let y = 0; y < size; y++) {
    const row = [0] // filter byte: None
    const cy = y - size / 2
    for (let x = 0; x < size; x++) {
      const cx = x - size / 2
      const d  = Math.sqrt(cx * cx + cy * cy)
      const r  = size / 2
      // Clip to circle with white ring border (4% of size)
      if (d > r) {
        // Outside circle — transparent would need RGBA; use white bg
        row.push(255, 255, 255)
      } else if (d > r * 0.96) {
        row.push(...W)
      } else {
        row.push(...BG)
      }
    }
    rows.push(Buffer.from(row))
  }

  const raw = deflateSync(Buffer.concat(rows))

  const IHDR = Buffer.concat([
    u32(size), u32(size),
    Buffer.from([8, 2, 0, 0, 0]), // 8-bit RGB, no interlace
  ])

  return Buffer.concat([
    Buffer.from('\x89PNG\r\n\x1a\n', 'binary'),
    pngChunk('IHDR', IHDR),
    pngChunk('IDAT', raw),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync('public/icon-192.png', makePNG(192))
writeFileSync('public/icon-512.png', makePNG(512))
console.log('✓ public/icon-192.png')
console.log('✓ public/icon-512.png')
