import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { NAV } from "./nav"

const ROUTES_DIR = join(__dirname, "..", "..", "routes")

const EXEMPT: Record<string, string> = {
  "catalog/new": "reached from the Catalog screen's own 'Add product' action, where the work is",
}

function declaredPaths(): Array<{ file: string; path: string }> {
  const out: Array<{ file: string; path: string }> = []
  for (const f of readdirSync(ROUTES_DIR)) {
    if (!f.endsWith(".tsx")) continue
    const src = readFileSync(join(ROUTES_DIR, f), "utf8")
    for (const m of src.matchAll(/^\s*path:\s*"([^"]*)"/gm)) out.push({ file: f, path: m[1]! })
  }
  return out
}

describe("⚠ no screen is reachable only by typing its URL", () => {
  it("found the route files (this guard must not pass vacuously)", () => {
    const paths = declaredPaths()
    expect(paths.length).toBeGreaterThanOrEqual(6)
  })

  it("every screen is in the nav, or states why it is not", () => {
    const navTargets = new Set(NAV.map((n) => n.to.replace(/^\//, "")))

    const unreachable = declaredPaths().filter(({ file, path }) => {
      if (file.startsWith("auth")) return false
      if (path.includes("$")) return false // a detail screen, opened from its own list
      if (path === "/" || path === "") return false // the index screen
      return !navTargets.has(path) && !(path in EXEMPT)
    })

    expect(
      unreachable.map((u) => `${u.path} (${u.file})`),
      "screen(s) with no way in — add a nav item, or an EXEMPT entry saying how it is reached",
    ).toEqual([])
  })

  it("the notification settings screen specifically is in the nav", () => {
    expect(NAV.map((n) => n.to)).toContain("/settings/notifications")
  })

  it("every exemption names a real route", () => {
    const paths = new Set(declaredPaths().map((p) => p.path))
    for (const key of Object.keys(EXEMPT)) {
      expect(paths.has(key), `EXEMPT lists "${key}", which is not a declared route`).toBe(true)
    }
  })

  it("every nav item points at a route that exists", () => {
    const paths = new Set(declaredPaths().map((p) => p.path))
    const broken = NAV.map((n) => n.to.replace(/^\//, "")).filter((t) => t !== "" && !paths.has(t))
    expect(broken, "nav item(s) pointing at a route that does not exist").toEqual([])
  })
})
