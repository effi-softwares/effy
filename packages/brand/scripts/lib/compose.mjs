// COMPOSE — build a wrapper SVG from (mark × colourway × composition).
//
// Composition happens in VECTOR space, before rasterisation (rule P4). No raster padding, cropping
// or compositing: each of those is an extra resample and a source of non-determinism, and it puts
// geometry decisions in the wrong domain.

import { applyColourway } from "../../src/colourways.mjs"
import { paddingFor } from "../../src/compositions.mjs"

/**
 * ⚠ RULE V1 — the authored master carries `width="100%" height="100%"`. Some rasterisers resolve a
 * percentage root size against a zero-size viewport and silently produce an empty surface. Explicit
 * dimensions are substituted before anything else touches the markup.
 */
export function withExplicitSize(svg, w, h) {
  if (!/width="100%"\s+height="100%"/.test(svg)) {
    throw new Error(
      "compose: authored master no longer declares width/height=100%. " +
        "Re-verify rule V1 before removing this guard — a silent zero-size render is the failure mode.",
    )
  }
  return svg.replace(/width="100%"\s+height="100%"/, `width="${w}" height="${h}"`)
}

/** Strip the outer <svg> element, keeping its children. */
function innerMarkup(svg) {
  const open = svg.indexOf(">")
  const close = svg.lastIndexOf("</svg>")
  if (open === -1 || close === -1) throw new Error("compose: malformed svg")
  return svg.slice(open + 1, close).trim()
}

/**
 * Build the composed wrapper SVG.
 *
 * The authored viewBox (0 0 500 500) is NOT the content bounds — the mark fills roughly half the
 * width and two-thirds of the height, sitting above and right of centre. Recomputing the viewBox
 * around the measured bbox fixes centring, padding and background in one exact step.
 *
 * @param {string}  markSvg  the authored master
 * @param {object}  bbox     {x, y, w, h} in viewBox units, MEASURED (rule V2), never hand-counted
 * @param {object}  cw       colourway
 * @param {object}  comp     composition
 */
export function composeSvg(markSvg, bbox, cw, comp) {
  const pad = paddingFor(comp.occupancy)
  const maxDim = Math.max(bbox.w, bbox.h)
  const side = maxDim * (1 + pad * 2)

  // Centre the content bbox inside the square frame.
  const ox = bbox.x - (side - bbox.w) / 2
  const oy = bbox.y - (side - bbox.h) / 2

  const coloured = applyColourway(markSvg, cw)
  const body = innerMarkup(coloured)

  // 026 polarity: the composition decides WHETHER there is a ground; when it opts in via
  // `groundFromColourway`, the colourway decides WHICH. `mono()` carries no ground, so mono targets
  // fall back to the composition's own value — which is what `ios-tinted`'s black relies on.
  const ground = comp.groundFromColourway && cw.ground ? cw.ground : comp.background
  const bg = ground
    ? `<rect x="${r(ox)}" y="${r(oy)}" width="${r(side)}" height="${r(side)}" fill="${ground}"/>`
    : ""

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(ox)} ${r(oy)} ${r(side)} ${r(side)}" ` +
    `width="${r(side)}" height="${r(side)}">${bg}${body}</svg>`
  )
}

/**
 * Fixed 4-decimal rounding. Float formatting differences across platforms are a determinism hazard
 * (SC-009) — pinning the precision removes a whole class of "identical but different" output.
 */
function r(n) {
  return Number(n.toFixed(4))
}

/** Occupancy actually achieved — used by the tests to assert rule P1 rather than trusting the input. */
export function actualOccupancy(bbox, comp) {
  const pad = paddingFor(comp.occupancy)
  const maxDim = Math.max(bbox.w, bbox.h)
  return maxDim / (maxDim * (1 + pad * 2))
}
