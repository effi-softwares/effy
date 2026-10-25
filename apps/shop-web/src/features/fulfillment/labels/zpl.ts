import { GEOMETRY, type LabelLayout, type PrinterDpi } from "./render"

export function labelDots(layout: LabelLayout, dpi: PrinterDpi): { w: number; h: number } {
  const g = GEOMETRY[layout]
  return { w: Math.round((g.widthMm / 25.4) * dpi), h: Math.round((g.heightMm / 25.4) * dpi) }
}

export function toMonochrome(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const rowBytes = Math.ceil(w / 8)
  const out = new Uint8Array(rowBytes * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const a = rgba[i + 3]! / 255
      // Transparent counts as white paper.
      const luma = (0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!) * a + 255 * (1 - a)
      if (luma < 128) out[y * rowBytes + (x >> 3)]! |= 0x80 >> (x & 7)
    }
  }
  return out
}

export function crc16(text: string): string {
  let crc = 0
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, "0")
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  // `deflate` is the zlib format Z64 expects.
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("deflate"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function base64(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export async function bitmapToZpl(bits: Uint8Array, w: number, h: number): Promise<string> {
  const rowBytes = Math.ceil(w / 8)
  const total = rowBytes * h
  const z64 = base64(await deflate(bits))
  return `^XA^PW${w}^LL${h}^FO0,0^GFA,${total},${total},${rowBytes},:Z64:${z64}:${crc16(z64)}^FS^XZ`
}

async function rasterise(
  svg: string,
  layout: LabelLayout,
  dpi: PrinterDpi,
): Promise<{ bits: Uint8Array; w: number; h: number }> {
  const { w, h } = labelDots(layout, dpi)
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
  try {
    const img = new Image(w, h)
    img.src = url
    await img.decode()
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")!
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    return { bits: toMonochrome(ctx.getImageData(0, 0, w, h).data, w, h), w, h }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function svgsToZpl(svgs: readonly string[], layout: LabelLayout, dpi: PrinterDpi): Promise<string> {
  const parts: string[] = []
  for (const svg of svgs) {
    const r = await rasterise(svg, layout, dpi)
    parts.push(await bitmapToZpl(r.bits, r.w, r.h))
  }
  return parts.join("\n")
}
