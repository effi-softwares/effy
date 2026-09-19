import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { NAV } from "./nav"

/**
 * ⚠ EVERY SCREEN IS REACHABLE WITHOUT TYPING A URL.
 *
 * THIS GUARD EXISTS BECAUSE 059 SHIPPED A SCREEN THAT WAS NOT. The notification settings route, its
 * screen, its hook, both backend routes and the entire web-push chain were built, typechecked and
 * tested — and the screen was linked from nowhere. An operator could not reach it, so no device
 * could register, so every `shop_new_order` intent the platform produced was recorded `skipped`
 * with `no_token`. The feature was complete and invisible.
 *
 * ⚠ THE EXISTING NAV TESTS PASSED THROUGHOUT, both before and after the fix — they assert how the
 * role filter behaves, not that the menu covers the app. Nothing in this repository would have
 * caught it. 039 found four defects of this shape "only by looking"; this is the one that can be
 * checked mechanically, so it is.
 *
 * ⚠ An exemption states its reason HERE, beside the rule, rather than in an allow-list nobody reads
 * while editing (054's `availability-exempt` pattern).
 */
const ROUTES_DIR = join(__dirname, "..", "..", "routes")

/** Routes that are deliberately not in the nav, each with the reason it is not. */
const EXEMPT: Record<string, string> = {
  "catalog/new": "reached from the Catalog screen's own 'Add product' action, where the work is",
  "dev/tokens": "a dev-only page of swatches; router.tsx strips it from production builds",
}

/** Every `path:` a route file declares. */
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
      if (file.startsWith("auth")) return false // the sign-in flow is where you arrive, not navigate
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
    // Named explicitly, not just covered by the sweep above: this is the one that was missing, and
    // the whole push feature is unusable without it. A regression here silently costs the operator
    // every notification, with the backend reporting healthy `skipped: no_token` drains forever.
    expect(NAV.map((n) => n.to)).toContain("/settings/notifications")
  })

  it("every exemption names a real route", () => {
    // An exemption for a route that no longer exists is a stale excuse that would let a genuinely
    // unreachable screen inherit it.
    const paths = new Set(declaredPaths().map((p) => p.path))
    for (const key of Object.keys(EXEMPT)) {
      expect(paths.has(key), `EXEMPT lists "${key}", which is not a declared route`).toBe(true)
    }
  })

  it("every nav item points at a route that exists", () => {
    // The mirror image: a nav entry to nowhere gives an operator a 404 and teaches them the console
    // is unreliable. 059's own P3 test makes the same assertion for notification destinations.
    const paths = new Set(declaredPaths().map((p) => p.path))
    const broken = NAV.map((n) => n.to.replace(/^\//, "")).filter(
      (t) => t !== "" && !paths.has(t),
    )
    expect(broken, "nav item(s) pointing at a route that does not exist").toEqual([])
  })
})
