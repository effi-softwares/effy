import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { LIVE_ROUTES } from "./routes"

// A key prefix that matches no declared query re-reads nothing, silently — the screen it was meant
// to keep current simply stops updating. So each prefix here must be the root of a real query.
const features = resolve(__dirname, "..")
const SOURCES = ["today/queries.ts", "fulfillment/queries.ts", "catalog/stockQueries.ts"].map((f) =>
  readFileSync(resolve(features, f), "utf8"),
)

describe("LIVE_ROUTES", () => {
  it("every prefix is the root of a query the console declares", () => {
    for (const prefixes of Object.values(LIVE_ROUTES)) {
      for (const prefix of prefixes ?? []) {
        const literal = `[${(prefix as string[]).map((p) => `"${p}"`).join(", ")}]`
        expect(SOURCES.some((s) => s.includes(literal)), `${literal} is declared nowhere`).toBe(true)
      }
    }
  })

  it("covers what the shop is told about (FR-026)", () => {
    expect(Object.keys(LIVE_ROUTES).sort()).toEqual(["attention", "orders", "stock"])
  })
})
