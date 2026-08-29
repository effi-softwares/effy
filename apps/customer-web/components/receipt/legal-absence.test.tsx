import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { canIssueTaxInvoice, sellerIdentity } from "@effy/legal-content"

import { DocumentStatusNote } from "./DocumentStatusNote"

/**
 * 052 US5 / FR-031 / SC-012 — the receipt must never display a FABRICATED legal identifier.
 *
 * ⚠ THE TEST IS ABOUT ABSENCE, WHICH IS THE HARDER THING TO ASSERT. It is easy to check that a value
 * renders; the failure this guards against is the opposite — a `[ABN]` placeholder reaching a
 * customer's receipt, or a plausible-looking substitute someone added to "fill the gap". The
 * constitution's Real-World Identifiers rule exists because exactly that happened once, with an email
 * address read out of session context and written into live infrastructure.
 */
describe("the receipt shows no fabricated legal identifier", () => {
  it("⚠ never surfaces a bracketed placeholder as a value", () => {
    const seller = sellerIdentity()
    for (const value of [seller.legalEntityName, seller.abn, seller.registeredAddress]) {
      // Either a real value, or NULL. Never the bracketed text, never an empty string.
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

  /**
   * ⚠ TWO independent prerequisites, and this must stay false until BOTH land (research R13).
   * Whoever supplies the ABN and expects tax invoices to appear should find this test.
   */
  it("⚠ cannot issue a tax invoice — the ABN is unsupplied AND per-item GST is unmodelled", () => {
    expect(canIssueTaxInvoice()).toBe(false)
  })

  it("states what the document IS, and how to get a real tax invoice (FR-032)", () => {
    const { container } = render(<DocumentStatusNote />)
    const text = container.textContent ?? ""

    expect(text).toContain("record of payment")
    expect(text).toContain("tax invoice")
    // ⚠ No ABN, no GST figure, and it does not TITLE itself a tax invoice.
    expect(text).not.toMatch(/\bABN\b/)
    expect(text).not.toMatch(/\bGST\s*(amount|total|payable)\b/i)
    expect(text).not.toMatch(/\[[A-Z_]+\]/)
  })
})
