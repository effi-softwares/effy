import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * A shop never sees a customer's points, nor whether an order used them. The shop may import the
 * refund code, but its own SQL and DTOs may name no points column, table or field.
 */

const here = dirname(fileURLToPath(import.meta.url))
const types = resolve(here, "../../../../packages/shared-types/src")

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* sources(full)
    else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) yield full
  }
}

const POINTS = /\bpoints_(used|value_amount|cents_per_point|shortfall_amount|returned|entry|allocation|hold|account|settings)\b|\b(pointsUsed|pointsAmount|pointsReturned|paymentSplit|cardAmount)\b/

describe("shop service points isolation (074 FR-027)", () => {
  it("found the shop's sources (the check must not pass vacuously)", () => {
    expect([...sources(here)].length).toBeGreaterThan(20)
  })

  it("no shop query, service or handler names a points column, table or field", () => {
    const offenders = [...sources(here)].filter((f) => POINTS.test(readFileSync(f, "utf8"))).map((f) => relative(here, f))
    expect(offenders).toEqual([])
  })

  it("no shop-facing contract type carries a points field", () => {
    const shopContracts = readdirSync(types).filter((f) => /^shop.*\.ts$/.test(f) && !/\.test\.ts$/.test(f))
    expect(shopContracts.length).toBeGreaterThan(0)
    const offenders = shopContracts.filter((f) => POINTS.test(readFileSync(join(types, f), "utf8")))
    expect(offenders).toEqual([])
  })

  it("the shop-manager refund route strips how the refund was split before answering", () => {
    // The refund result carries the points split, so the route must pass it through `withoutPaymentSplit`.
    const route = readFileSync(resolve(here, "functions/order-refund-v1-post.ts"), "utf8")
    expect(route).toMatch(/json\(200, withoutPaymentSplit\(await refunds\.issue\(/)
  })
})
