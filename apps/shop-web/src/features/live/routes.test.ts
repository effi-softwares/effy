import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { LIVE_ROUTES } from "./routes"

const features = resolve(__dirname, "..")
const SOURCES = ["today/queries.ts", "fulfillment/queries.ts", "catalog/stockQueries.ts", "catalog/queries.ts"].map(
  (f) => readFileSync(resolve(features, f), "utf8"),
)

describe("LIVE_ROUTES", () => {
  it("every prefix is the root of a query the console declares", () => {
    for (const prefixes of Object.values(LIVE_ROUTES)) {
      for (const prefix of prefixes ?? []) {
        const literal = `[${(prefix as string[]).map((p) => `"${p}"`).join(", ")}]`
        expect(
          SOURCES.some((s) => s.includes(literal)),
          `${literal} is declared nowhere`,
        ).toBe(true)
      }
    }
  })

  it("covers what the shop is told about (FR-026)", () => {
    expect(Object.keys(LIVE_ROUTES).sort()).toEqual(["attention", "orders", "products", "stock", "taxonomy"])
  })
})

// 103: each console list's cache key sits under the root its live kind refreshes.
describe("console lists sit under their live roots (103 T049)", () => {
  const under = (key: readonly unknown[], kind: keyof typeof LIVE_ROUTES) =>
    (LIVE_ROUTES[kind] ?? []).some((root) => (root as unknown[]).every((part, i) => key[i] === part))

  it("orders, products, availability and stock movements", async () => {
    const { PRODUCTS_ROOT } = await import("@/features/catalog/queries")
    const { AVAILABILITY_ROOT } = await import("@/features/catalog/availability")
    const { STOCK_ROOT } = await import("@/features/catalog/stockQueries")

    expect(under(["shop", "fulfillment", "orders", "list"], "orders")).toBe(true)
    expect(under(PRODUCTS_ROOT, "products")).toBe(true)
    expect(under(AVAILABILITY_ROOT, "stock")).toBe(true)
    expect(under([...STOCK_ROOT, "variant", "v1", "movements"], "stock")).toBe(true)
  })
})
