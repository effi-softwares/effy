import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { packUnitCompatible, UNIT_BASIS_WORDS, unitPrice, unitPriceCents, unitPriceText, type PackUnit, type UnitBasis } from "./unit-price"

const FIXTURES = JSON.parse(readFileSync(resolve(__dirname, "../unit-price.fixtures.json"), "utf8")) as {
  cases: Array<{ price: string; quantity: string; unit: PackUnit; basis: UnitBasis; amount: string | null; text: string | null }>
}

const APP_FIXTURE = resolve(
  __dirname,
  "../../../apps/customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/features/catalog/UnitPriceFixture.kt",
)
const APP_WORDS = resolve(
  __dirname,
  "../../../apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/catalog/domain/UnitPrice.kt",
)

describe("unit price (098 R12)", () => {
  it.runIf(existsSync(APP_FIXTURE))("the customer app's embedded fixture is this JSON, to the character", () => {
    const kt = readFileSync(APP_FIXTURE, "utf8")
    const embedded = kt.slice(kt.indexOf('"""') + 3, kt.lastIndexOf('"""')).trim()
    expect(JSON.parse(embedded)).toEqual(FIXTURES)
  })

  it.runIf(existsSync(APP_WORDS))("the customer app's words are these words", () => {
    const kt = readFileSync(APP_WORDS, "utf8")
    const word = (name: string) => new RegExp(`const val ${name}\\s*=\\s*"([^"]*)"`).exec(kt)?.[1]
    expect({ per_100g: word("PER_100G"), per_kg: word("PER_KG"), per_100ml: word("PER_100ML"), per_l: word("PER_L"), each: word("EACH") })
      .toEqual(UNIT_BASIS_WORDS)
  })

  it("agrees with every row of the shared fixture", () => {
    for (const c of FIXTURES.cases) {
      const got = unitPrice(c.price, c.quantity, c.unit, c.basis)
      expect(got?.amount ?? null, JSON.stringify(c)).toBe(c.amount)
      expect(got ? unitPriceText(got) : null, JSON.stringify(c)).toBe(c.text)
    }
  })

  it("pairs units with bases by dimension", () => {
    expect(packUnitCompatible("per_100g", "kg")).toBe(true)
    expect(packUnitCompatible("per_kg", "g")).toBe(true)
    expect(packUnitCompatible("per_l", "ml")).toBe(true)
    expect(packUnitCompatible("per_kg", "ml")).toBe(false)
    expect(packUnitCompatible("each", "g")).toBe(false)
    expect(packUnitCompatible("each", "each")).toBe(true)
  })

  it("is null without a pack size or a basis, never zero", () => {
    expect(unitPriceCents(320, null, "g", "per_100g")).toBeNull()
    expect(unitPriceCents(320, "500", null, "per_100g")).toBeNull()
    expect(unitPriceCents(320, "500", "g", null)).toBeNull()
    expect(unitPrice(null, "500", "g", "per_100g")).toBeNull()
  })

  it("rounds once, half up", () => {
    // 100 / 8 = 12.5 → 13
    expect(unitPriceCents(100, "8", "each", "each")).toBe(13)
    // 100 / 3 = 33.33 → 33
    expect(unitPriceCents(100, "3", "each", "each")).toBe(33)
  })
})
