import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { STOCK_CHANGED_MESSAGE } from "./checkout"
import { heldStockWords } from "./inventory"

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = JSON.parse(readFileSync(resolve(here, "checkout-words.fixtures.json"), "utf8")) as { stockChanged: string }

describe("checkout words (114)", () => {
  it("the fixture is the constant", () => {
    expect(STOCK_CHANGED_MESSAGE).toBe(fixtures.stockChanged)
  })

  it("the customer app embeds the same fixture, and says the same words", () => {
    const app = resolve(here, "../../../apps/customer-mobile/shared/src")
    const kt = readFileSync(resolve(app, "commonTest/kotlin/com/effyshopping/customer/mobile/features/checkout/CheckoutWordsFixture.kt"), "utf8")
    expect(JSON.parse(kt.slice(kt.indexOf('"""') + 3, kt.lastIndexOf('"""')))).toEqual(fixtures)
    const words = readFileSync(resolve(app, "commonMain/kotlin/com/effyshopping/customer/mobile/features/checkout/presentation/CheckoutWords.kt"), "utf8")
    const value = (name: string) => new RegExp(`const val ${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(words)?.[1]
    expect({ stockChanged: value("STOCK_CHANGED") }).toEqual(fixtures)
  })
})

describe("held stock words (114)", () => {
  it("says nothing when nothing is held, and the two numbers when something is", () => {
    expect(heldStockWords(null, null)).toBeNull()
    expect(heldStockWords(0, 5)).toBeNull()
    expect(heldStockWords(2, 3)).toBe("2 in checkouts · 3 left to sell")
  })
})
