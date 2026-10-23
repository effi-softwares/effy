import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { sellerIdentity } from "@effy/legal-content"

import { DocumentStatusNote } from "./DocumentStatusNote"

/** The receipt never shows a fabricated legal identifier: no `[ABN]` placeholder and no plausible substitute. */
describe("the receipt shows no fabricated legal identifier", () => {
  it("⚠ never surfaces a bracketed placeholder as a value", () => {
    const seller = sellerIdentity()
    for (const value of [seller.legalEntityName, seller.abn, seller.registeredAddress]) {
      // Either a real value, or null. Never the bracketed text, never an empty string.
      if (value !== null) {
        expect(value).not.toMatch(/^\[[A-Z_]+\]$/)
        expect(value.trim()).not.toBe("")
      }
    }
  })

  it("always carries the trading name and a customer-facing contact (FR-030)", () => {
    const seller = sellerIdentity()
    expect(seller.tradingName).toBe("Effy")
    expect(seller.supportEmail).toMatch(/@effyshopping\.com$/)
  })

  it("states what the document IS, and how to get a real tax invoice (FR-032)", () => {
    const { container } = render(<DocumentStatusNote />)
    const text = container.textContent ?? ""

    expect(text).toContain("record of payment")
    expect(text).toContain("tax invoice")
    // No ABN, no GST figure, and it does not title itself a tax invoice.
    expect(text).not.toMatch(/\bABN\b/)
    expect(text).not.toMatch(/\bGST\s*(amount|total|payable)\b/i)
    expect(text).not.toMatch(/\[[A-Z_]+\]/)
  })
})
