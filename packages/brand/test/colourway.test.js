import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import {
  COLOURWAYS,
  SLOTS,
  mono,
  applyColourway,
  RETIRED_JADE,
  RETIRED_EMERALD,
} from "../src/colourways.mjs"

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MARK = readFileSync(resolve(PKG, "src/logo.svg"), "utf8")

/** WCAG relative luminance / contrast, so the polarity claim is measured rather than asserted. */
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

// ── RULE C2, RESTATED FOR 026 ────────────────────────────────────────────────────────────────────
//
// 024's C2 was "outline and tag are SHARED by every colourway" — that was what made three
// hue-separated marks read as one mark. Under a monochrome brand there is no hue to separate with,
// so the separating axis became ground POLARITY and the slot values necessarily differ.
//
// The invariant that survives — and the one that actually keeps them one mark — is GEOMETRY.
describe("rule C2 (restated) — every colourway draws the same paths from the same slots", () => {
  const slotKeys = ["body", "fold", "outline", "tag"]

  for (const [key, cw] of Object.entries(COLOURWAYS)) {
    test(`${key} declares exactly the four slots plus a ground`, () => {
      for (const k of slotKeys) {
        assert.ok(typeof cw[k] === "string" && cw[k].length > 0, `${key} is missing slot ${k}`)
      }
      assert.match(cw.ground, /^#[0-9A-Fa-f]{6}$/, `${key} must declare a ground`)
    })

    test(`${key} produces identical geometry to the authored master`, () => {
      // Strip every colour value; what remains is the drawing. If two colourways ever differ here,
      // they are no longer one mark — which is precisely what old-C2 protected.
      const strip = (s) => s.replace(/(fill|stroke)="[^"]*"/g, "$1=\"•\"")
      assert.equal(strip(applyColourway(MARK, cw)), strip(MARK))
    })
  }

  test("no two colourways are the same asset", () => {
    const rendered = new Set(Object.values(COLOURWAYS).map((cw) => applyColourway(MARK, cw)))
    assert.equal(rendered.size, Object.keys(COLOURWAYS).length, "two colourways collapse to one mark")
  })
})

// ── FR-022 / SC-021, machine half ────────────────────────────────────────────────────────────────
describe("polarity — customer and shop are separable without a hue", () => {
  test("the light and dark grounds differ by at least 3:1", () => {
    const ratio = contrast(COLOURWAYS.light.ground, COLOURWAYS.dark.ground)
    assert.ok(ratio >= 3, `grounds are only ${ratio.toFixed(2)}:1 apart — not separable at 16px`)
  })

  test("each colourway's mark reads against its own ground", () => {
    for (const [key, cw] of Object.entries(COLOURWAYS)) {
      const bodyOnGround = contrast(cw.body, cw.ground)
      assert.ok(bodyOnGround >= 3, `${key}: body on ground is ${bodyOnGround.toFixed(2)}:1`)
      const outlineOnGround = contrast(cw.outline, cw.ground)
      assert.ok(outlineOnGround >= 3, `${key}: outline (handles) on ground is ${outlineOnGround.toFixed(2)}:1`)
      // The tag panel is bounded by an `outline`-coloured stroke, so those two must separate.
      const tagOnOutline = contrast(cw.tag, cw.outline)
      assert.ok(tagOnOutline >= 3, `${key}: tag on its own border is ${tagOnOutline.toFixed(2)}:1`)
    }
  })

  test("the palette is hueless — every slot and ground is a pure neutral", () => {
    for (const [key, cw] of Object.entries(COLOURWAYS)) {
      for (const [slot, hex] of Object.entries(cw)) {
        if (slot === "name" || typeof hex !== "string" || !hex.startsWith("#")) continue
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
        assert.ok(r === g && g === b, `${key}.${slot} = ${hex} is not a neutral (r/g/b differ)`)
      }
    }
  })
})

describe("rule C3 — retired palettes never appear", () => {
  test("no colourway carries a retired value", () => {
    // COLOURWAYS only — the RETIRED_* arrays legitimately name these values in this same module.
    const all = JSON.stringify(COLOURWAYS).toLowerCase()
    for (const hex of [...RETIRED_JADE, ...RETIRED_EMERALD]) {
      assert.ok(!all.includes(hex), `retired value ${hex} found in a colourway`)
    }
  })

  test("the authored master itself is already compliant", () => {
    const lower = MARK.toLowerCase()
    for (const hex of [...RETIRED_JADE, ...RETIRED_EMERALD]) {
      assert.ok(!lower.includes(hex), `retired value ${hex} found in src/logo.svg`)
    }
  })

  test("RETIRED_EMERALD covers every value the previous brand shipped", () => {
    // Both terracotta appearances, the dark-mode ring and BOTH splash grounds must be listed — those
    // live in .mjs and .xml files that check-no-jade.sh's include list cannot see, so this array is
    // the only thing standing between them and a silent survival.
    for (const hex of ["#065f46", "#10b981", "#d0735a", "#bf5540", "#dd8368", "#4ade80", "#3b82f6"]) {
      assert.ok(RETIRED_EMERALD.includes(hex), `${hex} missing from RETIRED_EMERALD`)
    }
  })
})

describe("colourway substitution", () => {
  test("light is the identity — the master IS the light colourway", () => {
    assert.equal(applyColourway(MARK, COLOURWAYS.light), MARK)
  })

  test("dark substitutes every slot exactly, occurrence for occurrence", () => {
    // ⚠ NOT "no light value remains": under polarity a colourway may legitimately reuse another
    // slot's authored value — `dark.tag` is #1A1A1A, which is `light`'s FOLD. A naive
    // "does the output still contain SLOTS.fold" check reads that as a leak and fails a correct
    // substitution. Count occurrences per slot instead, which is what correctness actually means.
    const count = (s, needle) => s.split(needle).length - 1
    const out = applyColourway(MARK, COLOURWAYS.dark)
    for (const slot of ["body", "fold", "outline", "tag"]) {
      assert.equal(
        count(out, COLOURWAYS.dark[slot]) >= count(MARK, SLOTS[slot]),
        true,
        `${slot}: expected at least ${count(MARK, SLOTS[slot])} occurrences of ${COLOURWAYS.dark[slot]}`,
      )
    }
    // And nothing may survive that belongs to no slot of the target colourway.
    const targetValues = new Set(["body", "fold", "outline", "tag"].map((k) => COLOURWAYS.dark[k]))
    for (const hex of out.match(/#[0-9A-Fa-f]{6}/g) ?? []) {
      assert.ok(targetValues.has(hex), `${hex} survives substitution but is not a dark slot value`)
    }
  })

  test("the four authored slot values are distinct", () => {
    // applyColourway substitutes by exact string match. Two slots sharing a value would make the
    // first substitution consume the second's occurrences, and the second would silently no-op.
    assert.equal(new Set(Object.values(SLOTS)).size, 4)
  })

  test("substitution cannot cascade — no slot consumes another's output", () => {
    const swap = { ...COLOURWAYS.light, body: SLOTS.fold, fold: SLOTS.body }
    const out = applyColourway(MARK, swap)
    const back = applyColourway(out, { ...COLOURWAYS.light, body: SLOTS.fold, fold: SLOTS.body })
    assert.equal(back, MARK)
  })
})

describe("mono derivation", () => {
  test("collapses to one colour and drops the tag fill", () => {
    const m = mono("#0A0A0A")
    assert.equal(m.body, "#0A0A0A")
    assert.equal(m.fold, "#0A0A0A")
    assert.equal(m.outline, "#0A0A0A")
    // A fully-filled mono mark collapses into an unrecognisable blob; the tag stays negative space.
    assert.equal(m.tag, "none")
  })

  test("carries no ground — mono targets are layers and inherit the composition's", () => {
    assert.equal(mono("#0A0A0A").ground, undefined)
  })

  test("applied to the master, only the mono colour and `none` remain", () => {
    const out = applyColourway(MARK, mono("#0A0A0A"))
    assert.ok(!out.includes(SLOTS.body))
    assert.ok(!out.includes(SLOTS.fold))
    assert.ok(!out.includes(SLOTS.tag))
    assert.match(out, /fill="none"/)
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
        // Skip the comment lines that NAME the rule in order to forbid it.
        const code = body
          .split("\n")
          .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
          .join("\n")
        assert.ok(!code.includes("design-system"), `${dir}/${f.name} imports design-system`)
      }
    }
  })
})
