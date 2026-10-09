import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { DeliveryQuoteDTO } from "@effy/shared-types"

import { chosenFee } from "@/lib/delivery-choice"

import { DeliveryFeeLines } from "./DeliveryFeeLines"

/**
 * 077 P25 — the website and the app show the SAME delivery lines for the same quote.
 *
 * ⚠ ONE FIXTURE: the quote literal in the app's `DeliveryWireContractTest.kt`, which the backend's
 * wire test proves the real mapper PRODUCES and the app's test proves it DECODES. This renders it on
 * the web and compares with the exact strings the app's `DeliveryFeeParityTest` asserts — so a label,
 * a sign or a rounding that differs between the two surfaces turns one of them red.
 */
const kotlin = readFileSync(
  resolve(__dirname, "../../../customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/features/checkout/DeliveryWireContractTest.kt"),
  "utf8",
)
const quote = JSON.parse(/const val DELIVERY_QUOTE_WIRE =\s*"""([^]*?)"""/.exec(kotlin)![1]!) as DeliveryQuoteDTO

/** What the app shows, as `DeliveryFeeParityTest.kt` writes it. */
export const EXPECTED = {
  window: ["Delivery: $6.00", "Window surcharge: $5.00"],
}

function shown(fee: NonNullable<ReturnType<typeof chosenFee>>): string[] {
  const { container } = render(<dl><DeliveryFeeLines fee={fee} currency="AUD" /></dl>)
  return Array.from(container.querySelectorAll("dl > div")).map((row) => {
    const [dt, dd] = Array.from(row.children)
    return `${dt!.textContent}: ${dd!.textContent}`
  })
}

const windowOf = (dayIndex: number) => {
  const w = quote.effyWindows!.days[dayIndex]!.windows[0]!
  return { slotId: w.slotId, date: w.date }
}

describe("P25 — the same lines on the web as in the app", () => {
  it("the window today, with what it adds", () => {
    expect(shown(chosenFee(quote, windowOf(0))!)).toEqual(EXPECTED.window)
  })
})
