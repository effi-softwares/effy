import { beforeEach, describe, expect, it } from "vitest"

import {
  __resetSavedCache,
  adoptSaved,
  applySaved,
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
})
