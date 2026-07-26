import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { pngColourType } from "../scripts/lib/raster.mjs"
import { TARGETS, KIND } from "../src/targets.mjs"
import { COMPOSITIONS } from "../src/compositions.mjs"

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

const RGB = 2
const RGBA = 6

describe("rule T3 — the alpha policy holds on the WRITTEN BYTES", () => {
  // Requesting `removeAlpha()` and getting it are different things. App Store Connect rejects an
  // icon that CONTAINS an alpha channel — even a fully opaque one — days after the build is
  // otherwise finished. Asserting the written bytes is what makes SC-006 provable up front.
  const pngTargets = TARGETS.filter((t) => t.kind === KIND.PNG)

  for (const t of pngTargets) {
    const expected = COMPOSITIONS[t.composition].alpha === "strip" ? RGB : RGBA
    test(`${t.path} is ${expected === RGB ? "RGB (no alpha)" : "RGBA"}`, () => {
      const abs = resolve(REPO, t.path)
      assert.ok(existsSync(abs), `${t.path} has not been generated — run \`make brand-gen\``)
      const ct = pngColourType(readFileSync(abs))
      assert.equal(
        ct,
        expected,
        expected === RGB
          ? `${t.path} carries an alpha channel and WILL be rejected at App Store submission`
          : `${t.path} lost its alpha channel — it will show an opaque box instead of a transparent layer`,
      )
    })
  }
})

describe("every iOS app icon is submission-safe", () => {
  const iosIcons = TARGETS.filter((t) => t.slot.startsWith("ios-app-icon"))

  test("all three appearances exist for both mobile apps", () => {
    // Six: {customer, shop} × {light, dark, tinted}. The dark and tinted slots were declared but
    // EMPTY in the template Contents.json — FR-007a fills them.
    assert.equal(iosIcons.length, 6)
  })

  for (const t of iosIcons) {
    test(`${t.path} has no alpha channel`, () => {
      assert.equal(pngColourType(readFileSync(resolve(REPO, t.path))), RGB)
    })
  }
})

describe("driver-mobile is untouched (FR-020)", () => {
  test("no target writes into apps/driver-mobile", () => {
    // The request named three web and two mobile apps. Driver is still the base KMP template with
    // no product surface; branding it belongs to the slice that builds it.
    const driver = TARGETS.filter((t) => t.path.includes("driver-mobile"))
    assert.equal(driver.length, 0, `driver-mobile must be out of scope, found: ${driver.map((t) => t.path)}`)
  })
})
