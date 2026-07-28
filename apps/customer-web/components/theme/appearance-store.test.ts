import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  APPEARANCE_KEY,
  __resetAppearanceStoreForTests,
  readAppearance,
  resolveDark,
  setAppearance,
} from "./appearance-store"

/**
 * 025 T102 — the store that replaced `next-themes` on the guest path.
 *
 * These cover the behaviours that make dropping the library safe rather than merely cheaper: the
 * migration is invisible to existing visitors, unreadable storage never breaks the page, and
 * `system` genuinely defers to the device.
 */

function mockMatchMedia(prefersDark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: prefersDark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  )
}

describe("appearance store", () => {
  beforeEach(() => {
    __resetAppearanceStoreForTests()
    window.localStorage.clear()
    document.documentElement.className = ""
    document.documentElement.style.colorScheme = ""
    mockMatchMedia(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("uses next-themes' storage key, so an existing choice survives the migration", () => {
    // ⚠ The single most important assertion here. A different key would silently reset every
    // visitor who had already chosen an appearance back to System.
    expect(APPEARANCE_KEY).toBe("theme")
    window.localStorage.setItem("theme", "dark")
    expect(readAppearance()).toBe("dark")
  })

  it("defaults to system when nothing is stored (FR-013)", () => {
    expect(readAppearance()).toBe("system")
  })

  it("treats an unrecognised stored value as system rather than trusting it", () => {
    window.localStorage.setItem("theme", "chartreuse")
    expect(readAppearance()).toBe("system")
  })

  it("falls back to system when storage throws", () => {
    // Private browsing, a sandboxed iframe, or storage disabled by policy. Not being able to
    // REMEMBER a preference must never stop the page rendering with a sensible one.
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError")
    })
    expect(readAppearance()).toBe("system")
    spy.mockRestore()
  })

  it("resolves light and dark without consulting the device", () => {
    mockMatchMedia(true)
    expect(resolveDark("light")).toBe(false)
    mockMatchMedia(false)
    expect(resolveDark("dark")).toBe(true)
  })

  it("resolves system from the device, in both directions", () => {
    mockMatchMedia(true)
    expect(resolveDark("system")).toBe(true)
    mockMatchMedia(false)
    expect(resolveDark("system")).toBe(false)
  })

  it("writes the class AND color-scheme, so controls and scrollbars match", () => {
    // Without color-scheme a dark page gets white scrollbars and white select dropdowns, which
    // reads as broken CSS rather than as a theme.
    setAppearance("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe("dark")

    setAppearance("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe("light")
  })

  it("persists the choice", () => {
    setAppearance("dark")
    expect(window.localStorage.getItem("theme")).toBe("dark")
  })

  it("applies the device appearance when set to system", () => {
    mockMatchMedia(true)
    setAppearance("system")
    expect(window.localStorage.getItem("theme")).toBe("system")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("still applies the appearance when persisting throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError")
    })
    expect(() => setAppearance("dark")).not.toThrow()
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    spy.mockRestore()
  })

  it("leaves no transition-suppression style behind", () => {
    // The suppression style is injected and removed around the swap. If a throw ever left one in
    // the document, every transition on the page would be dead for the rest of the session.
    setAppearance("dark")
    const leftovers = [...document.head.querySelectorAll("style")].filter((s) =>
      s.textContent?.includes("transition:none"),
    )
    expect(leftovers).toHaveLength(0)
  })
})
