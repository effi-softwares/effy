import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { beforeEach, describe, expect, it } from "vitest"

import { applyTheme, setTheme, uiStore } from "../ui-store"

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

  it("cannot throw when storage is unavailable", () => {
    expect(html).toMatch(/try\s*\{[\s\S]*localStorage[\s\S]*\}\s*catch/)
  })
})
