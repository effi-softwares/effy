import canvases from "./artwork-canvases.json"

/**
 * THE ARTWORK CANVAS SET (042) — the platform's definition of every artwork shape it accepts.
 *
 * ⚠ THIS REPLACES THE SINGLETON CANVAS. `banner-canvas.json` declared one shape, 1200×600 at 2:1, and
 * the server refused anything else. A bento of mixed-size tiles needs several, and a 2:1 image cannot
 * fill a tall tile without the cropping the contract forbids.
 *
 * ⚠ IT LIVES IN shared-types, NOT design-system, for the reason the original canvas did: verifying
 * stored artwork happens in an admin Lambda, and a Lambda importing a UI package to learn two numbers
 * is the wrong dependency. A canvas is a CONTRACT between the tool that produces artwork, the service
 * that verifies it, and the surfaces that render it — which is what this package is for.
 */

export interface ArtworkCanvas {
  readonly width: number
  readonly height: number
  readonly aspectRatio: number
  /** Ceiling for the NORMALISED artwork. The raw upload is governed by the shared media limit. */
  readonly maxBytes: number
}

interface CanvasFile {
  readonly canvases: Readonly<Record<string, ArtworkCanvas & { $comment?: unknown }>>
}

const FILE = canvases as unknown as CanvasFile

/** Every canvas key the platform knows. */
export const CANVAS_KEYS = Object.keys(FILE.canvases) as readonly ArtworkCanvasKey[]

export type ArtworkCanvasKey = "hero" | "tile-large" | "tile-wide" | "tile-tall" | "tile-small"

export const ARTWORK_CANVASES: Readonly<Record<ArtworkCanvasKey, ArtworkCanvas>> = Object.fromEntries(
  Object.entries(FILE.canvases).map(([k, v]) => [
    k,
    { width: v.width, height: v.height, aspectRatio: v.aspectRatio, maxBytes: v.maxBytes },
  ]),
) as Readonly<Record<ArtworkCanvasKey, ArtworkCanvas>>

/** The canvas for a key, or `null` for one this build does not know. */
export function canvasFor(key: string): ArtworkCanvas | null {
  return (ARTWORK_CANVASES as Record<string, ArtworkCanvas | undefined>)[key] ?? null
}

/**
 * Which canvas an offer tile of a given size must use.
 *
 * ⚠ The mapping lives HERE rather than in the validator or the composer, because those are two
 * consumers of one decision. Put it in either and the other eventually disagrees — which is the class
 * of defect this whole feature exists to remove.
 */
export function canvasForTileSize(size: string): ArtworkCanvasKey | null {
  switch (size) {
    case "large":
      return "tile-large"
    case "wide":
      return "tile-wide"
    case "tall":
      return "tile-tall"
    case "small":
      return "tile-small"
    default:
      return null
  }
}

/**
 * Exact-size check — what the server enforces and the composer pre-checks.
 *
 * ⚠ EXACT, NOT "close enough". The platform's promise is that artwork is never cropped, and that
 * holds only because the accepted shape and the rendered box share one ratio. A tolerance here would
 * quietly reintroduce cropping — and that promise is *already* false on the web surface, which never
 * imported the canvas at all. Fixing that is part of this feature.
 */
export function isCanonicalSize(key: string, width: number, height: number): boolean {
  const c = canvasFor(key)
  return c !== null && c.width === width && c.height === height
}

/** `"1200 × 600"` — for operator-facing copy, so no surface states a size by hand. */
export function canvasLabel(key: string): string | null {
  const c = canvasFor(key)
  return c === null ? null : `${c.width} × ${c.height}`
}
