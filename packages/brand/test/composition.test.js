import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { COMPOSITIONS, ANDROID_SAFE_OCCUPANCY, paddingFor } from "../src/compositions.mjs"
import { COLOURWAYS } from "../src/colourways.mjs"
import { composeSvg, actualOccupancy, withExplicitSize } from "../scripts/lib/compose.mjs"

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MARK = readFileSync(resolve(PKG, "src/logo.svg"), "utf8")

// The measured bbox (rule V2). Used as a fixture here so the maths is testable without rendering;
// the generator itself always MEASURES it rather than trusting this constant.
const BBOX = { x: 61.8, y: 110, w: 376.5, h: 280 }

describe("padding ↔ occupancy", () => {
  test("padding is the exact inverse of occupancy", () => {
    for (const occ of [0.34, 0.42, 0.48, 0.52, 0.9]) {
      const p = paddingFor(occ)
      assert.ok(Math.abs(1 / (1 + 2 * p) - occ) < 1e-12, `round-trip failed for ${occ}`)
    }
  })
})

describe("rule P1 — Android adaptive-icon safe zone", () => {
  test("the safe occupancy is 66dp of a 108dp canvas", () => {
    assert.ok(Math.abs(ANDROID_SAFE_OCCUPANCY - 66 / 108) < 1e-12)
  })

  // This is the single most common adaptive-icon defect and the direct subject of SC-004.
  for (const name of ["android-fg", "android-mono"]) {
    test(`${name} stays inside the safe zone`, () => {
      const occ = actualOccupancy(BBOX, COMPOSITIONS[name])
      assert.ok(
        occ <= ANDROID_SAFE_OCCUPANCY,
        `${name} occupies ${occ.toFixed(4)} of the canvas, exceeding the ${ANDROID_SAFE_OCCUPANCY.toFixed(
          4,
        )} safe zone — it WILL be clipped by circular launcher masks`,
      )
    })
  }
})

describe("rule P4 — composition happens in vector space", () => {
  test("recentres the viewBox on the content bbox, not the authored canvas", () => {
    const svg = composeSvg(MARK, BBOX, COLOURWAYS.tile, COMPOSITIONS["ios-app"])
    const vb = svg.match(/viewBox="([-\d.\s]+)"/)[1].split(/\s+/).map(Number)
    const [ox, oy, side] = vb

    // Square frame.
    assert.equal(vb[2], vb[3])
    // The content is centred in it — this is what the authored 0 0 500 500 canvas does NOT give us.
    //
    // Tolerance is 1e-3 viewBox units, not zero: composeSvg deliberately rounds to 4 decimals so
    // float-formatting differences cannot break byte-identical regeneration (SC-009). At the largest
    // size we emit (1024 px from a ~505-unit viewBox) 1e-3 units is ~2e-3 of a pixel.
    const TOL = 1e-3
    assert.ok(Math.abs(ox + side / 2 - (BBOX.x + BBOX.w / 2)) < TOL, "not horizontally centred")
    assert.ok(Math.abs(oy + side / 2 - (BBOX.y + BBOX.h / 2)) < TOL, "not vertically centred")
  })

  test("bakes a background only where the composition declares one", () => {
    const withBg = composeSvg(MARK, BBOX, COLOURWAYS.tile, COMPOSITIONS["ios-app"])
    const noBg = composeSvg(MARK, BBOX, COLOURWAYS.tile, COMPOSITIONS["android-fg"])
    assert.match(withBg, /<rect[^>]+fill="/)
    assert.doesNotMatch(noBg, /<rect/)
  })

  test("a groundFromColourway composition takes the colourway's ground", () => {
    const other = { ...COLOURWAYS.tile, ground: "#123456" }
    const out = composeSvg(MARK, BBOX, other, COMPOSITIONS["ios-app"])
    assert.match(out, /<rect[^>]+fill="#123456"/)
  })

  // The tinted source needs black for iOS's luminance-derived tinting, whatever the colourway says.
  test("ios-tinted keeps its own ground regardless of colourway", () => {
    const out = composeSvg(MARK, BBOX, COLOURWAYS.tile, COMPOSITIONS["ios-tinted"])
    assert.match(out, new RegExp(`<rect[^>]+fill="${COMPOSITIONS["ios-tinted"].background}"`))
  })

  // A rounded corner is only for files a platform shows as they are. Anything the platform masks
  // itself must be a full-bleed square, or the mask shows the corner's transparency.
  test("only the as-is files round their tile", () => {
    const rounded = Object.entries(COMPOSITIONS).filter(([, c]) => c.radius).map(([n]) => n)
    assert.deepEqual(rounded.sort(), ["android-legacy", "favicon", "web-icon"])
    assert.match(composeSvg(MARK, BBOX, COLOURWAYS.tile, COMPOSITIONS["web-icon"]), /<rect[^>]+rx="/)
    assert.doesNotMatch(composeSvg(MARK, BBOX, COLOURWAYS.tile, COMPOSITIONS["maskable"]), /rx="/)
  })

  // The maskable icon's guaranteed-visible region is a circle of 80% diameter.
  test("the maskable mark fits inside the safe circle", () => {
    const occ = COMPOSITIONS.maskable.occupancy
    const diagonal = occ * Math.hypot(1, BBOX.h / BBOX.w)
    assert.ok(diagonal <= 0.8, `the mark's diagonal is ${diagonal.toFixed(3)} of the icon`)
  })
})

describe("rule V1 — explicit dimensions", () => {
  test("substitutes concrete width/height for the authored 100%", () => {
    const out = withExplicitSize(MARK, 500, 500)
    assert.match(out, /width="500" height="500"/)
    assert.doesNotMatch(out, /width="100%"/)
  })

  test("raises loudly if the authored master stops declaring 100%", () => {
    // A silent zero-size render is the failure mode this guard exists to prevent.
    assert.throws(() => withExplicitSize('<svg width="500" height="500"></svg>', 1, 1), /rule V1/)
  })
})

describe("iOS compositions", () => {
  test("every ios-* profile is opaque and strips alpha (rule P2)", () => {
    for (const [name, c] of Object.entries(COMPOSITIONS)) {
      if (!name.startsWith("ios-")) continue
      assert.ok(c.background, `${name} must bake an opaque ground`)
      assert.equal(c.alpha, "strip", `${name} must strip alpha — App Store rejects any alpha channel`)
    }
  })
})

describe("layer compositions preserve alpha (rule P3)", () => {
  for (const name of ["android-fg", "android-mono", "badge", "splash"]) {
    test(`${name} keeps its alpha channel`, () => {
      assert.equal(COMPOSITIONS[name].alpha, "preserve")
      assert.equal(COMPOSITIONS[name].background, null, `${name} must not bake a ground`)
    })
  }
})
