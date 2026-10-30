// resvg renders; sharp does the two operations resvg cannot. Both are byte-identical across runs and write no PNG `tIME` chunk.

import { Resvg } from "@resvg/resvg-js"
import sharp from "sharp"
import { withExplicitSize } from "./compose.mjs"

/** PNG ihdr colour-type byte. 2 = RGB (no alpha), 6 = rgba. */
export function pngColourType(buf) {
  if (buf.length < 26 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG")
  return buf.readUInt8(25)
}

/** Render a composed SVG to PNG at an exact pixel width. */
export function renderPng(svg, size) {
  return new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng()
}

/** Renders and applies the alpha policy. For `strip` the written colour type is asserted: App Store Connect rejects an icon with an alpha channel. */
export async function renderWithAlphaPolicy(svg, size, alpha) {
  const raw = renderPng(svg, size)

  if (alpha === "preserve") {
    if (pngColourType(raw) !== 6) {
      throw new Error(`raster: expected RGBA for alpha=preserve, got colour-type ${pngColourType(raw)}`)
    }
    // One encoder for preserve and strip, so byte comparison stays meaningful.
    return await sharp(raw).png({ compressionLevel: 9 }).toBuffer()
  }

  if (alpha === "strip") {
    const out = await sharp(raw).removeAlpha().png({ compressionLevel: 9 }).toBuffer()
    const ct = pngColourType(out)
    if (ct !== 2) {
      throw new Error(
        `raster: alpha=strip produced PNG colour-type ${ct}, expected 2 (RGB). ` +
        `An iOS app icon with ANY alpha channel - even fully opaque - is rejected at submission.`,
      )
    }
    return out
  }

  throw new Error(`raster: unknown alpha policy '${alpha}'`)
}

/** Measures the content bounding box (render large, scan alpha, convert to viewBox units); never hard-coded. */
export async function measureBBox(markSvg, viewBoxSize = 500, sampleAt = 2000) {
  const sized = withExplicitSize(markSvg, viewBoxSize, viewBoxSize)
  const png = renderPng(sized, sampleAt)
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  let minx = info.width
  let miny = info.height
  let maxx = -1
  let maxy = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        if (x < minx) minx = x
        if (x > maxx) maxx = x
        if (y < miny) miny = y
        if (y > maxy) maxy = y
      }
    }
  }
  if (maxx < 0) throw new Error("measureBBox: the mark rendered completely empty")

  const k = viewBoxSize / sampleAt
  const round = (n) => Number((n * k).toFixed(1))
  return {
    x: round(minx),
    y: round(miny),
    w: round(maxx - minx + 1),
    h: round(maxy - miny + 1),
  }
}
