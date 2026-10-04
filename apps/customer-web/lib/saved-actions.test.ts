import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { refreshSaved, toggleSaved } from "./saved-actions"
import { __resetSavedCache, adoptSaved, isInNamedList, isSaved } from "./saved-store"

/**
 * The heart's rule (068 FR-019, FR-020, SC-008): a tap un-saves a product that is only in "Saved",
 * and NEVER takes a product out of a list the shopper named.
 */
describe("toggleSaved", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    window.localStorage.clear()
    __resetSavedCache()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("saves in one request, to the default list", async () => {
    fetchMock.mockResolvedValue({ status: 204 })
    expect(await toggleSaved("a", true)).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith("/api/saved/a", { method: "PUT" })
    expect(isSaved("a")).toBe(true)
  })

  it("un-saves a product that is only in Saved", async () => {
    adoptSaved(["a"], [])
    fetchMock.mockResolvedValue({ status: 204 })
    expect(await toggleSaved("a", false)).toBe(true)
    expect(isSaved("a")).toBe(false)
  })

  it("opens the chooser, and sends nothing, for a product in a named list", async () => {
    adoptSaved(["a"], ["a"])
    expect(await toggleSaved("a", false)).toBe("chooser")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(isSaved("a")).toBe(true)
  })

  /** The mirror did not know (another device made the list). The platform refuses; nothing is lost. */
  it("reverts and opens the chooser when the platform refuses the un-save", async () => {
    adoptSaved(["a"], [])
    fetchMock.mockResolvedValue({ status: 409 })
    expect(await toggleSaved("a", false)).toBe("chooser")
    expect(isSaved("a")).toBe(true)
  })

  it("does not read a 409 on a SAVE as an invitation to the chooser", async () => {
    fetchMock.mockResolvedValue({ status: 409 })
    expect(await toggleSaved("a", true)).toBe(false)
    expect(isSaved("a")).toBe(false)
  })

  it("a guest (401) keeps the tap", async () => {
    fetchMock.mockResolvedValue({ status: 401 })
    expect(await toggleSaved("a", true)).toBe(true)
    expect(isSaved("a")).toBe(true)
  })

  /** A guest has no named lists, so a guest's filled heart always un-saves. */
  it("a guest's filled heart un-saves", async () => {
    await (async () => {
      fetchMock.mockResolvedValue({ status: 401 })
      await toggleSaved("a", true)
    })()
    expect(await toggleSaved("a", false)).toBe(true)
    expect(isSaved("a")).toBe(false)
  })
})

describe("refreshSaved", () => {
  beforeEach(() => {
    window.localStorage.clear()
    __resetSavedCache()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("adopts the named subset", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ productIds: ["a", "b"], namedProductIds: ["b"] }) }),
    )
    await refreshSaved()
    expect(isInNamedList("b")).toBe(true)
    expect(isInNamedList("a")).toBe(false)
  })

  it("reads a backend from before 068 as having nothing named", async () => {
    adoptSaved(["a"], ["a"])
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ productIds: ["a"] }) }))
    await refreshSaved()
    expect(isInNamedList("a")).toBe(false)
  })

  it("leaves the mirror alone for a guest", async () => {
    adoptSaved(["a"])
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    await refreshSaved()
    expect(isSaved("a")).toBe(true)
  })
})
