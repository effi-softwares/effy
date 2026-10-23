import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import {
  COLOURWAYS,
  WORDMARK,
  SLOTS,
  mono,
  applyColourway,
  applyWordmark,
  RETIRED_JADE,
  RETIRED_EMERALD,
} from "../src/colourways.mjs"
import { TARGETS } from "../src/targets.mjs"

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MARK = readFileSync(resolve(PKG, "src/logo.svg"), "utf8")
const WORDMARK_SVG = readFileSync(resolve(PKG, "src/wordmark.svg"), "utf8")

/** WCAG relative luminance and contrast, so polarity is measured. */
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const luminance = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe("one identity — every surface carries the same icon (the driver app's variant aside, 092)", () => {
  test("there are exactly two colourways: the tile, and the driver app's blue full stop", () => {
    assert.deepEqual(Object.keys(COLOURWAYS), ["tile", "driver"])
    // The driver variant changes the full stop only: same ground, same letter.
    assert.equal(COLOURWAYS.driver.ground, COLOURWAYS.tile.ground)
    assert.equal(COLOURWAYS.driver.letter, COLOURWAYS.tile.letter)
  })

  test("it declares both slots plus a ground", () => {
    for (const k of ["letter", "dot", "ground"]) {
      assert.match(COLOURWAYS.tile[k], /^#[0-9a-f]{6}$/, `tile is missing ${k}`)
    }
  })

  test("every target but the driver app's uses the tile", () => {
    for (const t of TARGETS) {
      const expected = t.path.includes("apps/driver-mobile/") ? "driver" : "tile"
      assert.equal(t.colourway, expected, `${t.path} names another colourway`)
    }
  })

  test("recolouring never changes the drawing", () => {
    const strip = (s) => s.replace(/fill="[^"]*"/g, 'fill="•"')
    assert.equal(strip(applyColourway(MARK, COLOURWAYS.tile)), strip(MARK))
    assert.equal(strip(applyWordmark(WORDMARK_SVG, WORDMARK.dark)), strip(WORDMARK_SVG))
  })
})

describe("the mark reads on its tile", () => {
  test("the letter is at least 7:1 on the ground", () => {
    const ratio = contrast(COLOURWAYS.tile.letter, COLOURWAYS.tile.ground)
    assert.ok(ratio >= 7, `letter on ground is ${ratio.toFixed(2)}:1`)
  })

  test("the full stop is at least 3:1 on the ground", () => {
    const ratio = contrast(COLOURWAYS.tile.dot, COLOURWAYS.tile.ground)
    assert.ok(ratio >= 3, `full stop on ground is ${ratio.toFixed(2)}:1`)
  })
})

describe("the wordmark's two appearances", () => {
  test("the full stop is the same green in both, and the same green as the icon's", () => {
    assert.equal(WORDMARK.light.dot, WORDMARK.dark.dot)
    assert.equal(WORDMARK.light.dot, COLOURWAYS.tile.dot)
  })

  test("light is the master, unchanged", () => {
    assert.equal(applyWordmark(WORDMARK_SVG, WORDMARK.light), WORDMARK_SVG)
  })

  test("dark turns the word white and leaves the full stop green", () => {
    const out = applyWordmark(WORDMARK_SVG, WORDMARK.dark)
    assert.deepEqual(out.match(/#[0-9a-f]{6}/g), ["#ffffff", WORDMARK.dark.dot])
  })

  test("the word reads on the grounds it is meant for", () => {
    assert.ok(contrast(WORDMARK.light.word, "#ffffff") >= 7)
    assert.ok(contrast(WORDMARK.dark.word, "#151515") >= 7)
    assert.ok(contrast(WORDMARK.dark.dot, "#151515") >= 3)
  })
})

describe("rule C3 — retired palettes never appear", () => {
  test("no colourway carries a retired value", () => {
    // Colourways only: the RETIRED_* arrays name these values in the same module.
    const all = JSON.stringify(COLOURWAYS).toLowerCase()
    for (const hex of [...RETIRED_JADE, ...RETIRED_EMERALD]) {
      assert.ok(!all.includes(hex), `retired value ${hex} found in a colourway`)
    }
  })

  test("the authored masters themselves are compliant", () => {
    const lower = (MARK + WORDMARK_SVG).toLowerCase()
    for (const hex of [...RETIRED_JADE, ...RETIRED_EMERALD]) {
      assert.ok(!lower.includes(hex), `retired value ${hex} found in an authored master`)
    }
  })

  test("RETIRED_EMERALD covers every value the previous brand shipped", () => {
    // These live in.mjs and.xml files check-no-jade.sh cannot see, so this list is their only guard.
    for (const hex of ["#065f46", "#10b981", "#d0735a", "#bf5540", "#dd8368", "#4ade80", "#3b82f6"]) {
      assert.ok(RETIRED_EMERALD.includes(hex), `${hex} missing from RETIRED_EMERALD`)
    }
  })
})

describe("colourway substitution", () => {
  test("the master carries exactly the two authored slot values", () => {
    assert.deepEqual(MARK.match(/#[0-9a-f]{6}/g), [SLOTS.letter, SLOTS.dot])
  })

  test("the tile colourway substitutes both slots and leaves nothing else", () => {
    const out = applyColourway(MARK, COLOURWAYS.tile)
    assert.deepEqual(out.match(/#[0-9a-f]{6}/g), [COLOURWAYS.tile.letter, COLOURWAYS.tile.dot])
  })

  test("the two authored slot values are distinct", () => {
    // Two slots sharing a value would make the first substitution consume the second's.
    assert.notEqual(SLOTS.letter, SLOTS.dot)
  })

  test("substitution cannot cascade — no slot consumes another's output", () => {
    const swap = { letter: SLOTS.dot, dot: SLOTS.letter }
    assert.equal(applyColourway(applyColourway(MARK, swap), swap), MARK)
  })
})

describe("mono derivation", () => {
  test("collapses the letter and the full stop to one colour", () => {
    const m = mono("#09090b")
    assert.equal(m.letter, "#09090b")
    assert.equal(m.dot, "#09090b")
  })

  test("carries no ground — mono targets are layers and inherit the composition's", () => {
    assert.equal(mono("#09090b").ground, undefined)
  })

  test("applied to the master, only the mono colour remains", () => {
    const out = applyColourway(MARK, mono("#ffffff"))
    assert.deepEqual([...new Set(out.match(/#[0-9a-f]{6}/g))], ["#ffffff"])
  })
})

describe("rule C4 — mark colours are not design tokens", () => {
  test("this package does not depend on @effy/design-system", () => {
    const pkg = JSON.parse(readFileSync(resolve(PKG, "package.json"), "utf8"))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
    assert.ok(
      !Object.keys(deps).some((d) => d.includes("design-system")),
      "FR-014a: the mark's colours must be physically unable to reach the token SSOT",
    )
  })

  test("no source file imports from design-system", () => {
    for (const dir of ["src", "scripts", "scripts/lib"]) {
      for (const f of readdirSync(resolve(PKG, dir), { withFileTypes: true })) {
        if (!f.isFile() || !f.name.endsWith(".mjs")) continue
        const body = readFileSync(resolve(PKG, dir, f.name), "utf8")
        // Skip the comment lines that name the rule.
        const code = body
          .split("\n")
          .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
          .join("\n")
        assert.ok(!code.includes("design-system"), `${dir}/${f.name} imports design-system`)
      }
    }
  })
})
