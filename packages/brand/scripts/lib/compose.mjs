// Builds a wrapper SVG from mark × colourway × composition, in vector space before rasterising (no raster padding or cropping).

import { applyColourway } from "../../src/colourways.mjs"
import { paddingFor } from "../../src/compositions.mjs"

/** The master carries `width="100%" height="100%"`, which some rasterisers render empty; explicit dimensions go in first. */
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
 * The composed wrapper SVG. The authored viewBox (0 0 500 500) is not the content bounds, so the viewBox
 * is recomputed around the measured bbox.
 *
 * @param {string} markSvg the authored master
 * @param {object} bbox {x, y, w, h} in viewBox units, measured
 * @param {object} cw colourway
 * @param {object} comp composition
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

  // The composition decides whether there is a ground, the colourway which one. Mono has none, so the composition's own value applies (`ios-tinted`'s black).
  const ground = comp.groundFromColourway && cw.ground ? cw.ground : comp.background
  const rx = comp.radius ? ` rx="${r(side * comp.radius)}"` : ""
  const bg = ground
    ? `<rect x="${r(ox)}" y="${r(oy)}" width="${r(side)}" height="${r(side)}"${rx} fill="${ground}"/>`
    : ""

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(ox)} ${r(oy)} ${r(side)} ${r(side)}" ` +
    `width="${r(side)}" height="${r(side)}">${bg}${body}</svg>`
  )
}

/** Fixed 4-decimal rounding, so float formatting cannot vary across platforms. */
function r(n) {
  return Number(n.toFixed(4))
}

/** Occupancy actually achieved, for the tests. */
export function actualOccupancy(bbox, comp) {
  const pad = paddingFor(comp.occupancy)
  const maxDim = Math.max(bbox.w, bbox.h)
  return maxDim / (maxDim * (1 + pad * 2))
}
