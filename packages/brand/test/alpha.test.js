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
  // Requesting `removeAlpha` and getting it differ: assert the written bytes.
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
    // Six: {customer, driver} × {light, dark, tinted}.
    assert.equal(iosIcons.length, 6)
  })

  for (const t of iosIcons) {
    test(`${t.path} has no alpha channel`, () => {
      assert.equal(pngColourType(readFileSync(resolve(REPO, t.path))), RGB)
    })
  }
})

describe("driver-mobile has its own mark (092)", () => {
  const of = (app) => TARGETS.filter((t) => t.path.includes(`apps/${app}/`))
  test("the driver app gets the same set of icon and splash slots as the customer app", () => {
    assert.deepEqual(of("driver-mobile").map((t) => t.slot).sort(), of("customer-mobile").map((t) => t.slot).sort())
  })
  test("…drawn from the driver mark, with the blue full stop", () => {
    for (const t of of("driver-mobile")) {
      assert.equal(t.mark, "driver", t.path)
      if (!t.mono) assert.equal(t.colourway, "driver", t.path)
    }
  })
  test("no other surface uses the driver mark", () => {
    assert.deepEqual(TARGETS.filter((t) => t.mark === "driver" && !t.path.includes("apps/driver-mobile/")), [])
  })
})
