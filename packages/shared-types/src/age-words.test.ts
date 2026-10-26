import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { AGE_RESTRICTED_CART_SENTENCE, AGE_RESTRICTED_LABEL } from "./age-words"

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = JSON.parse(readFileSync(resolve(here, "age-words.fixtures.json"), "utf8")) as { label: string; cartSentence: string }

describe("age-restricted words (101)", () => {
  it("the fixture is the constants", () => {
    expect(AGE_RESTRICTED_LABEL).toBe(fixtures.label)
    expect(AGE_RESTRICTED_CART_SENTENCE).toBe(fixtures.cartSentence)
  })

  it("the customer app embeds the same fixture, and says the same words", () => {
    const app = resolve(here, "../../../apps/customer-mobile/shared/src")
    const kt = readFileSync(resolve(app, "commonTest/kotlin/com/effyshopping/customer/mobile/core/presentation/AgeWordsFixture.kt"), "utf8")
    expect(JSON.parse(kt.slice(kt.indexOf('"""') + 3, kt.lastIndexOf('"""')))).toEqual(fixtures)
    const words = readFileSync(resolve(app, "commonMain/kotlin/com/effyshopping/customer/mobile/core/presentation/AgeWords.kt"), "utf8")
    const value = (name: string) => new RegExp(`const val ${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(words)?.[1]
    expect({ label: value("LABEL"), cartSentence: value("CART_SENTENCE") }).toEqual(fixtures)
  })
})
