import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { RefundBlock } from "./RefundBlock"

function block(over: Partial<Parameters<typeof RefundBlock>[0]> = {}) {
  return render(
    <RefundBlock
      refunds={[{ amount: "10.00", state: "completed", refundedAt: "2026-08-30T00:00:00Z" }]}
      refundedTotal="10.00"
      amountPaidAfterRefunds="40.00"
      fullyRefunded={false}
      {...over}
    />,
  )
}

// A refund puts a second set of figures on the receipt; they must add up.
describe("the numbers a shopper checks against their bank", () => {
  it("shows what came back and what they are actually out of pocket", () => {
    block({
      refunds: [
        { amount: "6.00", state: "completed", refundedAt: null },
        { amount: "4.00", state: "completed", refundedAt: null },
      ],
    })
    // The total returned and what they are left having paid, read off the summary list ("Refunded" is also a state label).
    const totals = document.querySelector("dl")!
    const terms = [...totals.querySelectorAll("dt")].map((n) => n.textContent)
    const values = [...totals.querySelectorAll("dd")].map((n) => n.textContent)
    expect(terms).toEqual(["Refunded", "You paid"])
    expect(values).toEqual(["10.00", "40.00"])
  })

  it("says the order was refunded when all of it was", () => {
    block({ fullyRefunded: true, refundedTotal: "50.00", amountPaidAfterRefunds: "0.00" })
    expect(screen.getByText(/this order was refunded/i)).toBeInTheDocument()
  })
})

describe("what a shopper is told about each refund", () => {
  it.each([
    ["on_its_way", /on its way back to you/i],
    ["completed", /^refunded$/i],
    ["there_was_a_problem", /there was a problem/i],
  ])("says %s plainly", (state, expected) => {
    block({ refunds: [{ amount: "10.00", state: state as never, refundedAt: null }] })
    // Scoped to the per-refund list, since "Refunded" is also the totals row's label.
    const item = screen.getAllByRole("listitem")[0]!
    expect(within(item).getByText(expected)).toBeInTheDocument()
  })

  // The bank's rejection is staff information; a shopper cannot act on it.
  it("never shows the provider's reason, or anything about a shop", () => {
    const { container } = block({
      refunds: [{ amount: "10.00", state: "there_was_a_problem", refundedAt: null }],
    })
    const text = (container.textContent ?? "").toLowerCase()
    for (const leak of ["declined", "rejected", "card_", "shop", "provider", "stripe"]) {
      expect(text, `refund block leaks "${leak}"`).not.toContain(leak)
    }
  })
})

// An early refund often shows as a reversal (the charge vanishes), not a credit; nothing promises a credit line.
describe("timing", () => {
  it("does not promise a credit line", () => {
    const { container } = block()
    expect(container.textContent).toMatch(/original charge disappearing/i)
  })

  it("says when it depends on the bank rather than promising a date", () => {
    const { container } = block()
    const text = container.textContent ?? ""
    expect(text).toMatch(/depends on your bank/i)
    // No date or day count beyond the policy's "a few business days".
    expect(text).not.toMatch(/\b(tomorrow|today|by \w+day|within 24)\b/i)
  })

  // The published policy's own sentence, not a second wording.
  it("matches the published policy's wording", () => {
    const { container } = block()
    expect(container.textContent).toMatch(/usually within a few business days/i)
  })
})
