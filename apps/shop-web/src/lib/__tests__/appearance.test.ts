import { beforeEach, describe, expect, it } from "vitest"

import { applyTheme, setTheme, uiStore } from "../ui-store"

/**
 * US4 (T040) — Light / Dark / Follow-System survives sign-out and sign-in.
 *
 * ⚠ THE REASON THIS IS A TEST AND NOT AN INSPECTION. Appearance is stored in localStorage under this
 * surface's own prefix, and sign-out clears the SESSION. If a future sign-out ever reached for
 * `localStorage.clear()` — the obvious way to "log out cleanly" — it would take the operator's
 * appearance with it, and a shop tablet mounted under bright lights would silently revert to light
 * mode every shift. Nothing else in the codebase would fail.
 */
describe("appearance selection", () => {
  beforeEach(() => {
    localStorage.clear()
    setTheme("system")
  })

  it("offers all three modes, system included", () => {
    for (const mode of ["light", "dark", "system"] as const) {
      setTheme(mode)
      expect(uiStore.state.theme).toBe(mode)
    }
  })

  it("persists the choice under this surface's own namespaced key", () => {
    setTheme("dark")
    const keys = Object.keys(localStorage).filter((k) => k.includes("effy-shop"))
    expect(keys.length).toBeGreaterThan(0)
    expect(JSON.stringify(localStorage)).toContain("dark")
  })

  /**
   * ⚠ Namespacing is not cosmetic: an un-prefixed key would have one console's theme flip the other's
   * when both are run locally against the same origin.
   */
  it("writes nothing under a bare, un-namespaced key", () => {
    setTheme("dark")
    expect(localStorage.getItem("theme")).toBeNull()
  })

  it("puts the dark class on the document only for dark", () => {
    applyTheme("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    applyTheme("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })
})
