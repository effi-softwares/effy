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
      "promotions",
      "review",
      "slots",
      "taxonomy",
    ])
  })
})
