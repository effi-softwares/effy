/**
 * Tests for the parts of derive-localities that can be wrong without a 1.7 GB download telling you.
 *
 *     make reference-test        (or: node --test db/reference/)
 *
 * ⚠ Node's BUILT-IN test runner, deliberately. `db/reference/` is not a pnpm workspace package and
 * making it one to gain vitest would add a package to the monorepo for two test files. Node 22 is the
 * constitution's locked runtime and ships `node:test`, so this costs no dependency.
 *
 * ⚠ WHY THESE TESTS EXIST AT ALL. 030's derivation shipped a defect that only the real download could
 * surface: the pattern `/_LOCALITY_psv\.psv$/` also matches `{ST}_STREET_LOCALITY_psv.psv`, so it
 * would have loaded thousands of STREET names into the suburb list — silently, with every row
 * well-formed. A synthetic fixture has no such file to trip over, which is exactly why the *pattern*
 * is tested here rather than the pipeline.
 */
import { test } from "node:test"
import assert from "node:assert/strict"

import { AU_BOUNDS, FILE_PATTERNS, parsePoint } from "./derive-localities.mjs"

// ── File patterns ─────────────────────────────────────────────────────────────────────────────

test("LOCALITY matches the locality table for every state prefix", () => {
  for (const st of ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA", "OT"]) {
    assert.ok(FILE_PATTERNS.LOCALITY.test(`${st}_LOCALITY_psv.psv`), st)
  }
})

test("⚠ LOCALITY does NOT match STREET_LOCALITY — the 030 defect", () => {
  // The loose form `/_LOCALITY_psv\.psv$/` matches this. Street names would become suburbs.
  assert.equal(FILE_PATTERNS.LOCALITY.test("VIC_STREET_LOCALITY_psv.psv"), false)
  assert.equal(FILE_PATTERNS.LOCALITY.test("NSW_STREET_LOCALITY_ALIAS_psv.psv"), false)
})

test("⚠ LOCALITY does NOT match LOCALITY_POINT, and POINT does not match LOCALITY", () => {
  // These two are one word apart and hold completely different columns. Crossing them would put
  // LOCALITY_POINT's LONGITUDE-first layout through the locality parser.
  assert.equal(FILE_PATTERNS.LOCALITY.test("VIC_LOCALITY_POINT_psv.psv"), false)
  assert.equal(FILE_PATTERNS.LOCALITY_POINT.test("VIC_LOCALITY_psv.psv"), false)
  assert.ok(FILE_PATTERNS.LOCALITY_POINT.test("VIC_LOCALITY_POINT_psv.psv"))
})

test("⚠ LOCALITY_POINT does not match the other locality side-tables", () => {
  for (const n of [
    "VIC_LOCALITY_ALIAS_psv.psv",
    "VIC_LOCALITY_NEIGHBOUR_psv.psv",
    "VIC_STREET_LOCALITY_POINT_psv.psv",
  ]) {
    assert.equal(FILE_PATTERNS.LOCALITY_POINT.test(n), false, n)
  }
})

test("patterns are anchored at both ends", () => {
  assert.equal(FILE_PATTERNS.STATE.test("PREFIX_VIC_STATE_psv.psv"), false)
  assert.equal(FILE_PATTERNS.ADDRESS_DETAIL.test("VIC_ADDRESS_DETAIL_psv.psv.bak"), false)
})

// ── Coordinate parsing ────────────────────────────────────────────────────────────────────────

test("parses a real Melbourne coordinate", () => {
  assert.deepEqual(parsePoint("-37.814200", "144.963200"), { lat: -37.8142, lon: 144.9632 })
})

test("absent coordinate is null, not zero", () => {
  // ⚠ null means "we do not know". 0,0 is the Gulf of Guinea — it would price that suburb as the
  // furthest place on earth rather than reporting that anything was missing.
  assert.equal(parsePoint("", ""), null)
  assert.equal(parsePoint(undefined, undefined), null)
  assert.equal(parsePoint("  ", "  "), null)
})

test("⚠ half a coordinate is an ERROR, not an absence", () => {
  // Treating this as "no point" would hide a real parsing fault behind a legitimate-looking gap.
  assert.throws(() => parsePoint("-37.8142", ""), /half a coordinate/)
  assert.throws(() => parsePoint("", "144.9632"), /half a coordinate/)
})

test("unparseable coordinate throws", () => {
  assert.throws(() => parsePoint("north", "east"), /unparseable/)
  assert.throws(() => parsePoint("-37.8142", "NaN"), /unparseable/)
})

test("⚠ swapped lat/long is REJECTED, not silently accepted", () => {
  // G-NAF lists LONGITUDE first. Every Australian longitude (112…159) is a plausible-looking number
  // that is not a latitude, so a positional read would produce a coordinate that looks fine and puts
  // the suburb thousands of kilometres away. The bounds check is what catches it.
  assert.throws(() => parsePoint("144.9632", "-37.8142"), /outside Australia/)
})

test("coordinates outside Australia are rejected", () => {
  assert.throws(() => parsePoint("51.5074", "-0.1278"), /outside Australia/) // London
  assert.throws(() => parsePoint("0", "0"), /outside Australia/) // the null-island trap
})

test("the AU bounding box admits the mainland corners and Norfolk Island", () => {
  assert.ok(parsePoint("-10.6870", "142.5310")) // Cape York
  assert.ok(parsePoint("-43.6440", "146.8250")) // South East Cape, TAS
  assert.ok(parsePoint("-31.9500", "115.8600")) // Perth
  assert.ok(parsePoint("-29.0408", "167.9547")) // Norfolk Island (OT — filtered later, not here)
  assert.ok(AU_BOUNDS.maxLon >= 167.96, "bounds must reach the external territories")
})
