import { beforeEach, describe, expect, it } from "vitest"

import {
  __resetSavedCache,
  adoptSaved,
  applySaved,
  isInNamedList,
  isSaved,
  readSavedIds,
  resetSaved,
} from "./saved-store"

/**
 * ⚠ These exist because the capability this replaces had ZERO tests on ANY surface — no Go test, no
 * commonTest, no Vitest, no Playwright — despite 019's task list claiming "+ tests" for them. SC-014
 * is the requirement; this file is part of the evidence.
 */
describe("saved-store", () => {
  beforeEach(() => {
    window.localStorage.clear()
    __resetSavedCache()
  })

  it("starts empty", () => {
    expect(readSavedIds()).toEqual([])
  })

  it("round-trips through the versioned envelope", () => {
    adoptSaved(["a", "b"])
    __resetSavedCache() // force a real re-read from storage
    expect(readSavedIds()).toEqual(["a", "b"])
  })

  it("writes a versioned envelope, not a bare array", () => {
    adoptSaved(["a"])
    const raw = JSON.parse(window.localStorage.getItem("effy:saved:v1")!)
    expect(raw.version).toBe(1)
    expect(raw.productIds).toEqual(["a"])
  })

  /**
   * ⚠ A version mismatch DISCARDS rather than migrates. A half-understood set is worse than an empty
   * one, because the shopper would trust it.
   */
  it("discards a payload from a different schema version", () => {
    window.localStorage.setItem("effy:saved:v1", JSON.stringify({ version: 99, productIds: ["a"] }))
    __resetSavedCache()
    expect(readSavedIds()).toEqual([])
  })

  it("yields empty on unparseable storage rather than throwing", () => {
    window.localStorage.setItem("effy:saved:v1", "{ not json")
    __resetSavedCache()
    expect(() => readSavedIds()).not.toThrow()
    expect(readSavedIds()).toEqual([])
  })

  it("yields empty when productIds is not an array", () => {
    window.localStorage.setItem("effy:saved:v1", JSON.stringify({ version: 1, productIds: "a" }))
    __resetSavedCache()
    expect(readSavedIds()).toEqual([])
  })

  /**
   * ⚠ REFERENCE STABILITY. useSyncExternalStore compares snapshots by reference; a fresh [] on every
   * empty read looks like a changed snapshot and React trips an infinite render loop.
   */
  it("returns the identical empty reference on repeated reads", () => {
    expect(readSavedIds()).toBe(readSavedIds())
  })

  it("returns a cached reference while storage is unchanged", () => {
    adoptSaved(["a"])
    expect(readSavedIds()).toBe(readSavedIds())
  })

  it("applies a save to the front, so it is newest-first", () => {
    adoptSaved(["old"])
    applySaved("new", true)
    expect(readSavedIds()).toEqual(["new", "old"])
  })

  it("is idempotent in both directions", () => {
    applySaved("a", true)
    applySaved("a", true)
    expect(readSavedIds()).toEqual(["a"])

    applySaved("a", false)
    applySaved("a", false)
    expect(readSavedIds()).toEqual([])
  })

  it("removing something absent changes nothing", () => {
    adoptSaved(["a"])
    applySaved("zzz", false)
    expect(readSavedIds()).toEqual(["a"])
  })

  it("adopt replaces the set wholesale", () => {
    adoptSaved(["a", "b"])
    adoptSaved(["b", "c"])
    // ⚠ Replace, not merge — the platform is authoritative, and merging would resurrect items the
    // shopper removed on another device.
    expect(readSavedIds()).toEqual(["b", "c"])
    expect(isSaved("a")).toBe(false)
  })

  it("reset clears the device on sign-out", () => {
    adoptSaved(["a"])
    resetSaved()
    expect(readSavedIds()).toEqual([])
  })

  it("isSaved answers for one product", () => {
    adoptSaved(["a"])
    expect(isSaved("a")).toBe(true)
    expect(isSaved("b")).toBe(false)
  })

  /**
   * ⚠ THE ASYMMETRY THAT MATTERS (FR-022). Unknown renders as UNSAVED, never as saved. A false
   * "unsaved" costs one redundant, idempotent save; a false "saved" invites the destructive second
   * tap this whole feature exists to eliminate.
   */
  it("an unreadable mirror reports nothing as saved", () => {
    window.localStorage.setItem("effy:saved:v1", "corrupt")
    __resetSavedCache()
    expect(isSaved("anything")).toBe(false)
  })

  /* ── 068: named lists ───────────────────────────────────────────────────────────────────────── */

  /**
   * ⚠ THE GUEST-SURVIVAL PROOF. This is byte-for-byte what a browser holds from before 068. For a
   * guest it is the only copy of what they saved, and a version bump would discard it on deploy.
   */
  it("loads an envelope written before 068 with every id intact", () => {
    window.localStorage.setItem("effy:saved:v1", JSON.stringify({ version: 1, productIds: ["a", "b", "c"] }))
    __resetSavedCache()
    expect(readSavedIds()).toEqual(["a", "b", "c"])
    expect(isInNamedList("a")).toBe(false)
  })

  it("still writes under the v1 key and version", () => {
    adoptSaved(["a", "b"], ["a"])
    expect(Object.keys(window.localStorage)).toEqual(["effy:saved:v1"])
    const raw = JSON.parse(window.localStorage.getItem("effy:saved:v1")!)
    expect(raw.version).toBe(1)
    expect(raw.namedIds).toEqual(["a"])
  })

  it("round-trips the named set", () => {
    adoptSaved(["a", "b"], ["a"])
    __resetSavedCache()
    expect(isInNamedList("a")).toBe(true)
    expect(isInNamedList("b")).toBe(false)
  })

  /** A guest has no named lists, so nothing about lists is written for them. */
  it("writes no named field when there is nothing named", () => {
    applySaved("a", true)
    const raw = JSON.parse(window.localStorage.getItem("effy:saved:v1")!)
    expect("namedIds" in raw).toBe(false)
  })

  it("keeps the named set when an answer does not mention it", () => {
    adoptSaved(["a", "b"], ["a"])
    adoptSaved(["a", "b", "c"]) // the merge response: ids only
    expect(isInNamedList("a")).toBe(true)
  })

  it("drops a product from the named set once it is no longer saved", () => {
    adoptSaved(["a", "b"], ["a"])
    adoptSaved(["b"])
    expect(isInNamedList("a")).toBe(false)
  })

  it("clears the named set on reset", () => {
    adoptSaved(["a"], ["a"])
    resetSaved()
    expect(isInNamedList("a")).toBe(false)
  })

  it("ignores a named field that is not an array", () => {
    window.localStorage.setItem("effy:saved:v1", JSON.stringify({ version: 1, productIds: ["a"], namedIds: "a" }))
    __resetSavedCache()
    expect(readSavedIds()).toEqual(["a"])
    expect(isInNamedList("a")).toBe(false)
  })
})
