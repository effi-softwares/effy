import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { toVectorDrawable, assertRenderable } from "../scripts/lib/vector-drawable.mjs"

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

/*  REGRESSION SUITE — every case here comes from a bug that actually shipped to a device.

    The original converter emitted `android:pathData="M undefined,undefined L undefined,undefined"`
    for the three <line> elements in the mark's tag detail, because its attribute-name regex was
    `[a-zA-Z-]+` and therefore could not match x1/y1/x2/y2.

    What made it expensive: the output was valid XML, compiled cleanly through aapt2, and packaged
    into the APK. Nothing failed until Android tried to inflate it, and the only symptom was one
    logcat warning — `ShellStartingWindow: Get attribute fail` — while the launcher icon AND the
    splash screen both silently fell back to system defaults.                                      */

describe("<line> conversion (the regression)", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <g stroke="#0C1D36" stroke-width="12" stroke-linecap="round">
      <line x1="275" y1="240" x2="300" y2="210"/>
    </g>
  </svg>`

  test("emits real coordinates, not undefined", () => {
    const out = toVectorDrawable(svg, 108)
    assert.doesNotMatch(out, /undefined/, "pathData must not contain `undefined`")
    assert.match(out, /android:pathData="M 275,240 L 300,210"/)
  })

  test("inherits stroke attributes from the enclosing <g>", () => {
    const out = toVectorDrawable(svg, 108)
    assert.match(out, /android:strokeColor="#0c1d36"/)
    assert.match(out, /android:strokeWidth="12"/)
    assert.match(out, /android:strokeLineCap="round"/)
  })

  test("a <line> missing a coordinate raises instead of emitting rubbish", () => {
    const broken = `<svg viewBox="0 0 10 10" width="10" height="10"><line x1="1" y1="2" x2="3"/></svg>`
    assert.throws(() => toVectorDrawable(broken, 108), /not a finite number/)
  })
})

describe("assertRenderable", () => {
  test("rejects non-numeric path tokens", () => {
    for (const bad of ["M undefined,undefined", "M NaN,1 L 2,3", "M 1,2 L null,4", "M 1,2 L @,4"]) {
      assert.throws(
        () => assertRenderable(`<vector><path android:pathData="${bad}" /></vector>`),
        /non-numeric token|unparseable/,
        `should have rejected: ${bad}`,
      )
    }
  })

  test("accepts COMPACT path syntax with commands glued to numbers", () => {
    // "M0,0h108v108h-108z" is the solid background layer's own output and is perfectly valid.
    // An earlier version of this validator split on separators and rejected it — a false positive
    // that would have blocked every regeneration.
    assertRenderable(`<vector><path android:pathData="M0,0h108v108h-108z" /></vector>`)
    assertRenderable(`<vector><path android:pathData="M1.5-2.5e3L.5.25Z" /></vector>`)
  })

  test("rejects a non-numeric transform", () => {
    assert.throws(
      () => assertRenderable(`<vector><group android:translateX="undefined" /></vector>`),
      /is not a number/,
    )
  })

  test("accepts well-formed path data", () => {
    assertRenderable(
      `<vector><group android:translateX="-1.5" android:translateY="2"><path ` +
        `android:pathData="M 155 152 C 150 75, 205 85, 200 165 Z" android:strokeWidth="16" /></group></vector>`,
    )
  })
})

describe("every committed VectorDrawable is renderable", () => {
  // The check that would have caught this before it reached a device.
  const dirs = [
    "apps/customer-mobile/androidApp/src/main/res/drawable",
    "apps/shop-mobile/androidApp/src/main/res/drawable",
  ]
  for (const dir of dirs) {
    for (const f of readdirSync(resolve(REPO, dir)).filter((n) => n.endsWith(".xml"))) {
      test(`${dir}/${f}`, () => {
        assertRenderable(readFileSync(resolve(REPO, dir, f), "utf8"))
      })
    }
  }
})

describe("unsupported geometry still fails loudly", () => {
  test("an unknown element raises", () => {
    const svg = `<svg viewBox="0 0 10 10" width="10" height="10"><circle cx="5" cy="5" r="2"/></svg>`
    assert.throws(() => toVectorDrawable(svg, 108), /unsupported element <circle>/)
  })

  test("a non-translate transform raises", () => {
    const svg = `<svg viewBox="0 0 10 10" width="10" height="10"><g transform="rotate(45)"><path d="M 0 0"/></g></svg>`
    assert.throws(() => toVectorDrawable(svg, 108), /unsupported transform/)
  })
})
