// ICO — a zero-dependency writer (024 research R6).
//
// sharp cannot write ICO, and pulling a third image dependency for a format that is a 6-byte header
// plus a 16-byte directory entry per image is poor value. Modern ICO permits PNG payloads directly
// (universally supported since IE11), so this is container assembly with no encoding work at all.
//
// Layout:
//   ICONDIR    6 bytes   reserved(2)=0 · type(2)=1 · count(2)
//   ICONDIRENTRY  16 bytes each   w(1) h(1) colours(1) reserved(1)
//                                 planes(2)=1 bpp(2)=32 size(4) offset(4)
//   …then each PNG payload, in directory order.

const ICONDIR = 6
const ICONDIRENTRY = 16

/**
 * @param {Array<{size: number, png: Buffer}>} entries
 * @returns {Buffer}
 */
export function buildIco(entries) {
  if (!entries.length) throw new Error("ico: no entries")

  const header = Buffer.alloc(ICONDIR)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type 1 = icon
  header.writeUInt16LE(entries.length, 4)

  let offset = ICONDIR + entries.length * ICONDIRENTRY
  const dirs = []
  const payloads = []

  for (const { size, png } of entries) {
    if (size < 1 || size > 256) throw new Error(`ico: size ${size} out of range`)
    const d = Buffer.alloc(ICONDIRENTRY)
    // 256 is encoded as 0 — the field is one byte.
    d.writeUInt8(size >= 256 ? 0 : size, 0)
    d.writeUInt8(size >= 256 ? 0 : size, 1)
    d.writeUInt8(0, 2) // palette colours (0 = truecolour)
    d.writeUInt8(0, 3) // reserved
    d.writeUInt16LE(1, 4) // colour planes
    d.writeUInt16LE(32, 6) // bits per pixel
    d.writeUInt32LE(png.length, 8)
    d.writeUInt32LE(offset, 12)
    offset += png.length
    dirs.push(d)
    payloads.push(png)
  }

  return Buffer.concat([header, ...dirs, ...payloads])
}

/** Parse an ICO back to its directory — used by the tests to prove the container is well-formed. */
export function readIcoDirectory(buf) {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error("ico: bad header")
  const count = buf.readUInt16LE(4)
  const out = []
  for (let i = 0; i < count; i++) {
    const o = ICONDIR + i * ICONDIRENTRY
    out.push({
      width: buf.readUInt8(o) || 256,
      height: buf.readUInt8(o + 1) || 256,
      bpp: buf.readUInt16LE(o + 6),
      length: buf.readUInt32LE(o + 8),
      offset: buf.readUInt32LE(o + 12),
    })
  }
  return out
}
