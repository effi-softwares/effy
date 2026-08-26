import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { OrderDTO } from "@effy/shared-types"

import { ReceiptDocument } from "./ReceiptDocument"

/**
 * 052 US1. The document is a pure, synchronous component precisely so it can be tested — the pages
 * that host it are async Server Components, which Vitest cannot render.
 */
function order(over: Partial<OrderDTO> = {}): OrderDTO {
  return {
    id: "o1",
    orderNumber: "EFY-NAAZAY",
    status: "paid",
    placedAt: "2026-08-26T04:14:00Z",
    items: [
      {
        productId: "p1",
        productName: "Barilla Spaghetti No.5 500g",
        unitPriceAmount: "3.60",
        quantity: 1,
        lineSubtotalAmount: "3.60",
      },
      {
        productId: "p2",
        productName: "Quilton 3 Ply Toilet Tissue 12 Pack",
        unitPriceAmount: "9.50",
        quantity: 2,
        lineSubtotalAmount: "19.00",
      },
    ],
    deliveryAddress: {
      recipientName: "Janith",
      phone: null,
      line1: "12 Swan Street",
      line2: null,
      city: "Richmond",
      region: "VIC",
      postalCode: "3121",
      country: "AU",
    },
    billingAddress: null,
    itemSubtotalAmount: "22.60",
    discountAmount: "0.00",
    deliveryFeeAmount: "8.00",
    promoCode: null,
    grandTotalAmount: "30.60",
    currency: "AUD",
    paymentStatus: "succeeded",
    fulfillments: [],
    stage: "confirmed",
    paymentMethod: null,
    arrivalEstimates: [],
    ...over,
  }
}

/** Parse "$30.60" back to a number so the assertion is about ARITHMETIC, not about formatting. */
function money(text: string): number {
  return Number(text.replace(/[^0-9.-]/g, ""))
}

describe("ReceiptDocument — the lines add up (FR-004, SC-002)", () => {
  it("sums the line totals to the items subtotal, and reconciles to the total charged", () => {
    render(<ReceiptDocument order={order()} />)

    // Every line total is on screen.
    expect(screen.getByText("$3.60")).toBeInTheDocument()
    expect(screen.getByText("$19.00")).toBeInTheDocument()

    const subtotal = money(screen.getByText("Items subtotal").nextElementSibling!.textContent!)
    expect(3.6 + 19.0).toBeCloseTo(subtotal, 2)

    const total = money(screen.getByText("Total paid").nextElementSibling!.textContent!)
    // subtotal − discount + delivery = total = what was charged.
    expect(subtotal - 0 + 8.0).toBeCloseTo(total, 2)
  })

  it("reconciles WITH a discount and a delivery fee", () => {
    render(
      <ReceiptDocument
        order={order({
          items: [
            {
              productId: "p1",
              productName: "Milk",
              unitPriceAmount: "3.10",
              quantity: 2,
              lineSubtotalAmount: "6.20",
            },
          ],
          itemSubtotalAmount: "6.20",
          discountAmount: "1.20",
          promoCode: "SPRING10",
          deliveryFeeAmount: "8.00",
          grandTotalAmount: "13.00",
        })}
      />,
    )
    expect(screen.getByText("SPRING10")).toBeInTheDocument()
    const total = money(screen.getByText("Total paid").nextElementSibling!.textContent!)
    expect(6.2 - 1.2 + 8.0).toBeCloseTo(total, 2)
  })

  /**
   * ⚠ A component that is genuinely zero is OMITTED, never rendered as a dash. On a financial record
   * "nothing" and "unknown" are different claims, and a dash reads as the second.
   */
  it("omits a zero discount and a zero delivery fee entirely", () => {
    render(
      <ReceiptDocument
        order={order({ discountAmount: "0.00", deliveryFeeAmount: "0.00", grandTotalAmount: "22.60" })}
      />,
    )
    expect(screen.queryByText(/Discount/)).not.toBeInTheDocument()
    expect(screen.queryByText("Delivery")).not.toBeInTheDocument()
    const total = money(screen.getByText("Total paid").nextElementSibling!.textContent!)
    expect(total).toBeCloseTo(22.6, 2)
  })
})

describe("ReceiptDocument — what a line must show (FR-003)", () => {
  /** The unit price has been on the wire since 019 and NO surface rendered it. */
  it("shows the unit price beside every line, not just the line total", () => {
    render(<ReceiptDocument order={order()} />)
    expect(screen.getByText("$3.60 each")).toBeInTheDocument()
    expect(screen.getByText("$9.50 each")).toBeInTheDocument()
  })

  it("renders a whole line when the product has no image", () => {
    render(<ReceiptDocument order={order()} />)
    // No image is present, and yet the money and the name are.
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(screen.getByText("Barilla Spaghetti No.5 500g")).toBeInTheDocument()
    expect(screen.getByText("$3.60")).toBeInTheDocument()
  })
})

describe("ReceiptDocument — degrading on a pre-052 order (FR-006)", () => {
  /**
   * A pre-052 order, or one whose post-commit capture failed, carries no payment method. The line must
   * be ABSENT — not blank, and not a dash that could be read as "unknown".
   */
  it("omits the payment line entirely when nothing was captured", () => {
    render(<ReceiptDocument order={order({ paymentMethod: null })} />)
    expect(screen.queryByText(/Paid with/)).not.toBeInTheDocument()
    // The document is still whole.
    expect(screen.getByText("Total paid")).toBeInTheDocument()
    expect(screen.getByText("EFY-NAAZAY")).toBeInTheDocument()
  })

  it("shows the method when it was captured", () => {
    render(
      <ReceiptDocument
        order={order({ paymentMethod: { type: "card", brand: "visa", last4: "4242" } })}
      />,
    )
    expect(screen.getByText(/Paid with/)).toBeInTheDocument()
    expect(screen.getByText("visa")).toBeInTheDocument()
    expect(screen.getByText("4242")).toBeInTheDocument()
  })

  it("shows a wallet or pay-over-time method that carries no last4", () => {
    render(
      <ReceiptDocument
        order={order({ paymentMethod: { type: "pay_over_time", brand: "klarna", last4: null } })}
      />,
    )
    expect(screen.getByText("klarna")).toBeInTheDocument()
    expect(screen.queryByText(/ending/)).not.toBeInTheDocument()
  })
})

/**
 * ⚠ SC-011. Effy is ONE brand with hidden fulfilment: nothing on this document may disclose that an
 * order was split, into how many parts, or which nodes handled it.
 */
describe("ReceiptDocument — discloses no fulfilment structure (FR-009, SC-011)", () => {
  it("renders no shop identity, count, distance or ring even when the order has portions", () => {
    const { container } = render(
      <ReceiptDocument
        order={order({
          fulfillments: [
            { status: "picking", itemCount: 1, subtotalAmount: "3.60" },
            { status: "delivered", itemCount: 2, subtotalAmount: "19.00" },
          ],
        })}
      />,
    )
    const text = container.textContent ?? ""

    // ⚠ WORD BOUNDARIES, not substrings — and that distinction is itself the finding. A bare
    // `toContain("shop")` fails on the seller's own address, `hello@effyshopping.com`, which is
    // supposed to be there (FR-030). The rule is "no shop IDENTITY", not "the letters s-h-o-p".
    for (const banned of [/\bshops?\b/i, /\brings?\b/i, /\bdistance\b/i, /\bnodes?\b/i, /\bwarehouse\b/i]) {
      expect(text).not.toMatch(banned)
    }
    // And nothing that betrays the COUNT of portions.
    expect(text).not.toMatch(/\b\d+ of \d+\b|\bpart \d\b|\bparcel \d\b/i)
  })
})
