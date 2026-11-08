import { readdirSync } from "node:fs"
import { join } from "node:path"

import { DESTINATION_KINDS, shopPathFor, type ShopDestination } from "@effy/shared-types"
import { describe, expect, it } from "vitest"

const ROUTES_DIR = join(__dirname, "..", "..", "routes")

/** One example of every shop destination kind (109): with and without the item it names. */
const EXAMPLES: ShopDestination[] = [
  { kind: "queue" },
  { kind: "queue", fulfillmentId: "f-1" },
  { kind: "product", productId: "p-1" },
  { kind: "catalog" },
]

/** `orders.$fulfillmentId.tsx` → the route `/orders/:param`, as path segments with params as "$". */
function declaredRoutes(): string[][] {
  return readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith(".tsx") && !f.startsWith("__"))
    .map((f) => f.replace(/\.tsx$/, "").split(".").map((seg) => (seg.startsWith("$") ? "$" : seg)))
}

function matches(path: string, routes: string[][]): boolean {
  const segs = path.split("?")[0]!.split("/").filter(Boolean)
  return routes.some((r) => r.length === segs.length && r.every((seg, i) => seg === "$" || seg === segs[i]))
}

describe("⚠ P3 - no shop notification opens a 404 (109: the destination list decides)", () => {
  it("the examples cover every shop destination kind", () => {
    expect([...new Set(EXAMPLES.map((d) => d.kind))].sort()).toEqual([...DESTINATION_KINDS.shop].sort())
  })

  it("every shop destination opens a route this console declares", () => {
    const routes = declaredRoutes()
    for (const d of EXAMPLES) {
      const path = shopPathFor(d)
      expect(matches(path, routes), `${JSON.stringify(d)} → "${path}" has no route file`).toBe(true)
    }
  })

  it("does not claim other surfaces' routes as its own", () => {
    expect(declaredRoutes().some((r) => r[0] === "runs")).toBe(false)
  })
})
