import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { COLOURWAYS, SLOTS, mono, applyColourway, RETIRED_JADE } from "../src/colourways.mjs"

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MARK = readFileSync(resolve(PKG, "src/logo.svg"), "utf8")

describe("rule C2 — outline and tag are shared by every colourway", () => {
  // This invariant is what keeps three colourways reading as ONE mark (FR-002, SC-003).
  // A colourway that varies them fractures the brand, which is exactly what SC-003 measures.
  for (const [key, cw] of Object.entries(COLOURWAYS)) {
    test(`${key} shares the navy outline and off-white tag`, () => {
      assert.equal(cw.outline, SLOTS.outline)
      assert.equal(cw.tag, SLOTS.tag)
    })
  }

  test("the three colourways differ ONLY in body and fold", () => {
    const bodies = new Set(Object.values(COLOURWAYS).map((c) => c.body))
    const folds = new Set(Object.values(COLOURWAYS).map((c) => c.fold))
    assert.equal(bodies.size, 3, "each colourway must have a distinct body")
    assert.equal(folds.size, 3, "each colourway must have a distinct fold")
  })
})

describe("rule C3 — the retired Jade palette never appears", () => {
  test("no colourway carries a retired value", () => {
    const all = JSON.stringify(COLOURWAYS).toLowerCase()
    for (const jade of RETIRED_JADE) {
      assert.ok(!all.includes(jade), `retired value ${jade} found in a colourway`)
    }
  })

  test("the authored master itself is already compliant", () => {
    // The supplied artwork used #0FB57E/#047857. The committed master is recoloured into the live
    // palette so scripts/check-no-jade.sh passes with NO exemption (constitution v1.10.0).
    const lower = MARK.toLowerCase()
    for (const jade of RETIRED_JADE) {
      assert.ok(!lower.includes(jade), `retired value ${jade} found in src/logo.svg`)
    }
  })
})

describe("colourway substitution", () => {
  test("emerald is the identity — the master IS the emerald colourway", () => {
    assert.equal(applyColourway(MARK, COLOURWAYS.emerald), MARK)
  })

  test("blue replaces body and fold, and nothing else", () => {
    const out = applyColourway(MARK, COLOURWAYS.blue)
    assert.ok(out.includes("#3b82f6"), "body not applied")
    assert.ok(out.includes("#1e40af"), "fold not applied")
    assert.ok(!out.includes(SLOTS.body), "emerald body leaked through")
    assert.ok(!out.includes(SLOTS.fold), "emerald fold leaked through")
    // Shared slots survive untouched (rule C2).
    assert.ok(out.includes(SLOTS.outline))
    assert.ok(out.includes(SLOTS.tag))
  })

  test("substitution cannot cascade — no slot consumes another's output", () => {
    // fold (#065f46) is a substring of nothing else, but the placeholder pass is what actually
    // guarantees this. Swapping body↔fold must round-trip exactly.
    const swap = { ...COLOURWAYS.emerald, body: SLOTS.fold, fold: SLOTS.body }
    const out = applyColourway(MARK, swap)
    const back = applyColourway(out, { ...COLOURWAYS.emerald, body: SLOTS.fold, fold: SLOTS.body })
    assert.equal(back, MARK)
  })

  test("neutral produces a mark with no brand hue", () => {
    const out = applyColourway(MARK, COLOURWAYS.neutral)
    assert.ok(out.includes("#525252"))
    assert.ok(!out.includes("#10b981"))
    assert.ok(!out.includes("#3b82f6"))
  })
})

describe("mono derivation", () => {
  test("collapses to one colour and drops the tag fill", () => {
    const m = mono("#0C1D36")
    assert.equal(m.body, "#0C1D36")
    assert.equal(m.fold, "#0C1D36")
    assert.equal(m.outline, "#0C1D36")
    // A fully-filled mono mark collapses into an unrecognisable blob; the tag stays negative space.
    assert.equal(m.tag, "none")
  })

  test("applied to the master, only the mono colour and `none` remain", () => {
    const out = applyColourway(MARK, mono("#0C1D36"))
    assert.ok(!out.includes("#10b981"))
    assert.ok(!out.includes("#065f46"))
    assert.ok(!out.includes("#F4F5F7"))
    assert.match(out, /fill="none"/)
  })
})

describe("rule C4 — the blue is not a design token", () => {
  test("this package does not depend on @effy/design-system", () => {
    const pkg = JSON.parse(readFileSync(resolve(PKG, "package.json"), "utf8"))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
    assert.ok(
      !Object.keys(deps).some((d) => d.includes("design-system")),
      "FR-014a: the shop blue must be physically unable to reach the token SSOT",
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
