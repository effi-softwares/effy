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

// ⚠ T063. 051 and 052 EACH shipped a receipt whose lines did not add up, and a refund puts a second
// set of figures on the same document.
describe("the numbers a shopper checks against their bank", () => {
  it("shows what came back and what they are actually out of pocket", () => {
    block({
      refunds: [
        { amount: "6.00", state: "completed", refundedAt: null },
        { amount: "4.00", state: "completed", refundedAt: null },
      ],
    })
    // ⚠ The two figures a shopper reconciles against their statement: the total returned, and what
    // they are left having paid. Read off the SUMMARY definition list, not off a line that happens
    // to carry the same word — "Refunded" is both a state label and a totals label.
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
    // ⚠ Scoped to the per-refund list. "Refunded" is also the totals row's label, and an unscoped
    // query would pass on whichever it found first — asserting nothing about the state word.
    const item = screen.getAllByRole("listitem")[0]!
    expect(within(item).getByText(expected)).toBeInTheDocument()
  })

  // ⚠ T059 / SC-009. "Your bank rejected the refund" is staff information — a shopper cannot act on
  // it, and surfacing it invites them to argue with a message that will not change.
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

// ⚠ T062. A refund issued soon after payment often appears as a REVERSAL — the original charge simply
// vanishes and no separate credit ever shows up (research R2). A shopper told to look for a credit
// will not find one, and will contact us about money already returned.
describe("timing", () => {
  it("does not promise a credit line", () => {
    const { container } = block()
    expect(container.textContent).toMatch(/original charge disappearing/i)
  })

  it("says when it depends on the bank rather than promising a date", () => {
    const { container } = block()
    const text = container.textContent ?? ""
    expect(text).toMatch(/depends on your bank/i)
    // No specific date or day count is promised beyond the policy's own "a few business days".
    expect(text).not.toMatch(/\b(tomorrow|today|by \w+day|within 24)\b/i)
  })

  // ⚠ The published policy's own sentence, not a second one. Two places describing the same timing
  // will drift, and the one that drifts is whichever a developer edits without opening the legal doc.
  it("matches the published policy's wording", () => {
    const { container } = block()
    expect(container.textContent).toMatch(/usually within a few business days/i)
  })
})
