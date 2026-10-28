import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { LIVE_ROUTES } from "./routes"

const features = resolve(__dirname, "..")
const SOURCES = [
  "orders",
  "dispatch",
  "drivers",
  "exceptions",
  "delivery",
  "product-review",
  "customers",
  "promotions",
  "promotion-groups",
  "taxonomy",
  "products",
].map((slice) => readFileSync(resolve(features, slice, "queries.ts"), "utf8"))

describe("LIVE_ROUTES", () => {
  it("every prefix is the root of a query the console declares", () => {
    for (const prefixes of Object.values(LIVE_ROUTES)) {
      for (const prefix of prefixes ?? []) {
        const parts = prefix as string[]
        const literal = `[${parts.map((p) => `"${p}"`).join(", ")}]`
        const spread = parts.length === 3 ? `[...ROOT, "${parts[2]}"]` : null
        const found = SOURCES.some(
          (s) =>
            s.includes(literal) ||
            (spread !== null && s.includes(spread) && s.includes(`["${parts[0]}", "${parts[1]}"]`)),
        )
        expect(found, `${literal} is declared nowhere`).toBe(true)
      }
    }
  })

  it("covers what back-office is told about (FR-029)", () => {
    expect(Object.keys(LIVE_ROUTES).sort()).toEqual([
      "coverage",
      "dispatch",
      "orders",
      "points",
      "pricing",
      "products",
      "promotions",
      "review",
      "slots",
      "taxonomy",
    ])
  })
})

// 103: a console list re-reads when told, so each list's cache key must sit under the root its kind refreshes.
describe("console lists sit under their live roots (103 T049)", () => {
  const under = (key: readonly unknown[], kind: keyof typeof LIVE_ROUTES) =>
    (LIVE_ROUTES[kind] ?? []).some((root) => (root as unknown[]).every((part, i) => key[i] === part))

  it("orders, courier parcels, review, missing details, products, imports, coverage, promotions, exceptions, drivers", async () => {
    const { ORDERS_LIST_KEY } = await import("@/features/orders/list")
    const { REVIEW_KEY } = await import("@/features/product-review/list")
    const { productKeys } = await import("@/features/products/queries")
    const { COVERAGE_KEY } = await import("@/features/delivery/queries")
    const { PROMO_ROOT } = await import("@/features/promotions/queries")
    const { EXCEPTIONS_KEY } = await import("@/features/exceptions/queries")

    expect(under(ORDERS_LIST_KEY, "orders")).toBe(true)
    expect(under(["orders", "courier"], "orders")).toBe(true)
    expect(under(REVIEW_KEY, "review")).toBe(true)
    expect(under(productKeys.all, "products")).toBe(true)
    expect(under(COVERAGE_KEY, "coverage")).toBe(true)
    expect(under(PROMO_ROOT, "promotions")).toBe(true)
    expect(under([...EXCEPTIONS_KEY, "list"], "dispatch")).toBe(true)
    expect(under(["drivers"], "dispatch")).toBe(true)
    expect(under(["customers"], "points")).toBe(true)
  })
})
