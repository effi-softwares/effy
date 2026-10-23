import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Every shop notification opens a route this console declares. The destination is decided in
 * `apis/edge-api/notifications/src/worker/copy.ts` and the routes here, and no compiler sees both, so this
 * reads both. Shop types only (by the `group` field): `order_*` opens customer-web and `run_assigned` the
 * driver app.
 */

const COPY_SRC = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "apis",
  "edge-api",
  "notifications",
  "src",
  "worker",
  "copy.ts",
)
const ROUTES_DIR = join(__dirname, "..", "..", "routes")

/** Every `{ webPath, group }` pair the copy catalogue declares, read from its source. */
function declaredDestinations(): Array<{ webPath: string; group: string }> {
  const src = readFileSync(COPY_SRC, "utf8")
  const entries: Array<{ webPath: string; group: string }> = []
  // Each copy entry is a small object literal; capture webPath and the group that follows it.
  const re = /webPath:\s*"([^"]+)"[\s\S]{0,200}?group:\s*"([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) entries.push({ webPath: m[1]!, group: m[2]! })
  return entries
}

/**
 * The top-level path segments TanStack Router declares, from the file names.
 * `orders.$fulfillmentId.tsx` → "orders"; `catalog.tsx` → "catalog".
 */
function declaredRouteRoots(): Set<string> {
  const roots = new Set<string>()
  for (const f of readdirSync(ROUTES_DIR)) {
    if (!f.endsWith(".tsx") || f.startsWith("__")) continue
    const root = f.replace(/\.tsx$/, "").split(".")[0]!
    roots.add(root)
  }
  return roots
}

describe("⚠ P3 — no shop notification opens a 404", () => {
  it("found the copy catalogue and parsed destinations from it", () => {
    // Guards the guard. If the catalogue moves or its shape changes, this test would otherwise
    // pass vacuously over an empty list — which is how 054 found `TestRailsCarryOnlyAvailable
    // Products` passing with nothing in it.
    const all = declaredDestinations()
    expect(all.length).toBeGreaterThanOrEqual(10)
    expect(all.some((d) => d.group === "orders")).toBe(true)
    expect(all.some((d) => d.group === "attention")).toBe(true)
  })

  it("every shop destination is a route this console declares", () => {
    const roots = declaredRouteRoots()
    const shop = declaredDestinations().filter(
      (d) => d.group === "orders" || d.group === "attention",
    )

    expect(shop.length).toBeGreaterThan(0)
    for (const { webPath, group } of shop) {
      expect(webPath.startsWith("/"), `${webPath} must be an absolute path`).toBe(true)
      const root = webPath.split("/")[1] ?? ""
      expect(roots.has(root), `${group}: "${webPath}" has no route file for "${root}"`).toBe(true)
    }
  })

  it("does not claim other surfaces' routes as its own", () => {
    // `run_assigned` opens the driver app, not this console. If its group were ever changed to a
    // shop one, the test above would start failing on /runs — which is the correct outcome, and
    // this states why.
    const roots = declaredRouteRoots()
    expect(roots.has("runs")).toBe(false)
  })
})
