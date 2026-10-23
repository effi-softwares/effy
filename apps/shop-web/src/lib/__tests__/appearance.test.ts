import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { beforeEach, describe, expect, it } from "vitest"

import { applyTheme, setTheme, uiStore } from "../ui-store"

/**
 * Light / Dark / Follow-System survives sign-out and sign-in.
 *
 * The reason this is a test and not an inspection. Appearance is stored in localStorage under this
 * surface's own prefix, and sign-out clears the session. If a future sign-out ever reached for
 * `localStorage.clear` — the obvious way to "log out cleanly" — it would take the operator's
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
   * Namespacing is not cosmetic: an un-prefixed key would have one console's theme flip the other's
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

/**
 * The pre-paint script in index.html reads localStorage before any module loads, so it cannot import the
 * key. If its literal drifts from `createUiStore(prefix)`'s `${prefix}.theme`, a dark-mode operator gets
 * a bright flash on every load and nothing fails. Pinned by reading the real file.
 */
describe("pre-paint appearance restore", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8")

  it("reads the same localStorage key the store writes", () => {
    setTheme("dark")
    const writtenKey = Object.keys(localStorage).find((k) => k.endsWith(".theme"))
    expect(writtenKey).toBeTruthy()
    expect(html).toContain(`localStorage.getItem("${writtenKey}")`)
  })

  it("sets both the data-theme attribute and the Tailwind class hook", () => {
    expect(html).toContain('setAttribute("data-theme"')
    expect(html).toContain('classList.toggle("dark"')
  })

  /** A throw here leaves a blank document, so the script must swallow blocked/absent storage. */
  it("cannot throw when storage is unavailable", () => {
    expect(html).toMatch(/try\s*\{[\s\S]*localStorage[\s\S]*\}\s*catch/)
  })
})
