import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { CreateCheckoutIntentResponse } from "@effy/shared-types"

import { PaymentStep } from "./PaymentStep"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

// The three PCI-scoped inputs are provider iframes; stand them in with labelled boxes so the SHELL —
// which is the part Effy owns and this feature is about — can be asserted.
vi.mock("@stripe/react-stripe-js", () => ({
  useStripe: () => ({}),
  useElements: () => ({ getElement: () => ({}) }),
  CardNumberElement: () => <div data-testid="card-number" />,
  CardExpiryElement: () => <div data-testid="card-expiry" />,
  CardCvcElement: () => <div data-testid="card-cvc" />,
}))

function intent(over: Partial<CreateCheckoutIntentResponse> = {}): CreateCheckoutIntentResponse {
  return {
    orderId: "o1",
    orderNumber: "EFY-1",
    clientSecret: "cs_1",
    publishableKey: "pk_test",
    grandTotalAmount: "14.60",
    currency: "AUD",
    ...over,
  }
}

describe("PaymentStep (051 US1)", () => {
  /**
   * ⚠ SC-004 / FR-003 — the reason this feature exists.
   *
   * The payment step must carry the amount and NOTHING else. This asserts the ABSENCE of order content,
   * which is the only way to test a requirement whose whole content is "do not show these things".
   */
  it("shows no basket line, delivery address or delivery-speed control", () => {
    render(<PaymentStep intent={intent()} onBack={vi.fn()} />)

    expect(screen.queryByText(/delivery address/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/delivery speed/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/same-day/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/review your order/i)).not.toBeInTheDocument()
    expect(screen.queryByRole("img")).not.toBeInTheDocument() // no product thumbnails
  })

  /**
   * ⚠ SC-001 / FR-014 / FR-015 — three fields, and the three that are ABSENT matter more than the three
   * that are present. Country and postcode are what the shopper reported; they are gone because Effy
   * sends the address it already holds at confirm time instead.
   */
  it("asks for exactly three card details and never a country, postcode or name", () => {
    render(<PaymentStep intent={intent()} onBack={vi.fn()} />)

    expect(screen.getByText("Card number")).toBeInTheDocument()
    expect(screen.getByText("Expiry")).toBeInTheDocument()
    expect(screen.getByText("Security code")).toBeInTheDocument()

    expect(screen.queryByText(/country/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/postal ?code|postcode|zip/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/name on card|cardholder/i)).not.toBeInTheDocument()
  })

  /** ⚠ SC-005 — the figure shown is the figure from the server, never one the client computed. */
  it("shows the server's amount, and shows it on the pay control", () => {
    render(<PaymentStep intent={intent({ grandTotalAmount: "23.05" })} onBack={vi.fn()} />)

    expect(screen.getByText("$23.05")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /pay \$23\.05/i })).toBeInTheDocument()
  })

  /**
   * ⚠ FR-041 — the control cannot be pressed until there is something to pay with. The old form let a
   * shopper submit an empty card form and find out from the provider.
   */
  it("keeps the pay control disabled until the card fields are complete", () => {
    render(<PaymentStep intent={intent()} onBack={vi.fn()} />)
    expect(screen.getByRole("button", { name: /pay \$14\.60/i })).toBeDisabled()
  })

  /** FR-004 — exactly one route back, and it does not lose the basket. */
  it("offers one clearly-labelled route back to checkout", () => {
    const onBack = vi.fn()
    render(<PaymentStep intent={intent()} onBack={onBack} />)
    expect(screen.getByRole("button", { name: /back to checkout/i })).toBeInTheDocument()
  })

  /** FR-035 — the pay rail is held by a rule and space, not a bordered card. */
  it("lays the pay rail out without a card container", () => {
    const { container } = render(<PaymentStep intent={intent()} onBack={vi.fn()} />)
    const aside = container.querySelector("aside")
    expect(aside).not.toBeNull()
    expect(aside!.className).not.toMatch(/\brounded-(lg|xl|2xl)\b/)
    expect(aside!.className).not.toMatch(/\bborder\b(?!-l)/)
  })
})
