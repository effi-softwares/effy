import { describe, expect, it } from "vitest"

import {
  ARTWORK_CANVASES,
  CANVAS_KEYS,
  type ArtworkCanvasKey,
  canvasFor,
  canvasForTileSize,
  canvasLabel,
  isCanonicalSize,
} from "./artwork-canvas"

/**
 * These are the invariants `check-banner-canvas.mjs` asserted for the single canvas, generalised to
 * the set. They are cheap and they catch the failure that matters: a canvas whose declared ratio does
 * not match its own dimensions would refuse conforming artwork and accept non-conforming artwork,
 * with the operator seeing only "wrong size" and no way to work out why.
 */
describe("every canvas is internally coherent", () => {
  for (const key of CANVAS_KEYS) {
    describe(key, () => {
      const c = ARTWORK_CANVASES[key]

      it("declares a ratio that matches its own dimensions", () => {
        // Tolerance rather than equality: the file stores a rounded ratio for readability.
        expect(Math.abs(c.width / c.height - c.aspectRatio)).toBeLessThan(0.001)
      })

      it("is large enough to render crisply on a high-density screen", () => {
        // A tile is never wider than ~600 CSS px in the bento; 3× covers the densest displays.
        expect(Math.max(c.width, c.height)).toBeGreaterThanOrEqual(900)
      })

      it("caps its normalised bytes below the shared media limit", () => {
        expect(c.maxBytes).toBeGreaterThan(0)
        expect(c.maxBytes).toBeLessThanOrEqual(1024 * 1024)
      })

      it("has whole-pixel dimensions", () => {
        expect(Number.isInteger(c.width)).toBe(true)
        expect(Number.isInteger(c.height)).toBe(true)
      })
    })
  }
})

describe("the set covers every tile size", () => {
  /**
   * ⚠ This is the mapping that would otherwise be written twice — once in the validator deciding
   * which canvas to check against, once in the composer deciding which to normalise to. Two copies
   * of one decision is the drift this feature exists to remove.
   */
  it("maps each authorable tile size to exactly one canvas", () => {
    expect(canvasForTileSize("large")).toBe("tile-large")
    expect(canvasForTileSize("wide")).toBe("tile-wide")
    expect(canvasForTileSize("tall")).toBe("tile-tall")
    expect(canvasForTileSize("small")).toBe("tile-small")
  })

  it("returns null for a size that is not authorable, rather than guessing", () => {
    expect(canvasForTileSize("enormous")).toBeNull()
  })

  it("resolves every mapped canvas to a real definition", () => {
    for (const size of ["large", "wide", "tall", "small"]) {
      const key = canvasForTileSize(size)
      expect(key).not.toBeNull()
      expect(canvasFor(key as string)).not.toBeNull()
    }
  })

  /**
   * ⚠ tile-wide and tile-tall are deliberate inverses, so one photograph can be prepared for either
   * without a second shoot. If someone re-tunes the numbers, this is the relationship to preserve.
   */
  it("keeps tile-wide and tile-tall as inverses of one another", () => {
    const wide = ARTWORK_CANVASES["tile-wide"]
    const tall = ARTWORK_CANVASES["tile-tall"]
    expect(wide.width).toBe(tall.height)
    expect(wide.height).toBe(tall.width)
  })
})

describe("size conformance is exact", () => {
  /**
   * ⚠ EXACT, NOT "close enough". The platform's promise is that artwork is never cropped, and it
   * holds only because the accepted shape and the rendered box share one ratio. A tolerance here
   * would quietly reintroduce cropping — and that promise is already false on the web surface today,
   * which hardcodes `aspect-[2/1]` and never imported the canvas at all.
   */
  it("accepts only the declared dimensions", () => {
    const c = ARTWORK_CANVASES["tile-large"]
    expect(isCanonicalSize("tile-large", c.width, c.height)).toBe(true)
    expect(isCanonicalSize("tile-large", c.width + 1, c.height)).toBe(false)
    expect(isCanonicalSize("tile-large", c.width, c.height - 1)).toBe(false)
  })

  it("refuses an unknown canvas key rather than defaulting to one", () => {
    expect(isCanonicalSize("not-a-canvas", 1200, 1200)).toBe(false)
    expect(canvasFor("not-a-canvas")).toBeNull()
    expect(canvasLabel("not-a-canvas")).toBeNull()
  })

  it("states its size for operator copy, so no surface writes one by hand", () => {
    const c = ARTWORK_CANVASES.hero
    expect(canvasLabel("hero")).toBe(`${c.width} × ${c.height}`)
  })
})

describe("the set is what the catalogue expects", () => {
  it("contains the hero canvas and four tile canvases", () => {
    const expected: ArtworkCanvasKey[] = ["hero", "tile-large", "tile-wide", "tile-tall", "tile-small"]
    expect([...CANVAS_KEYS].sort()).toEqual([...expected].sort())
  })
})
