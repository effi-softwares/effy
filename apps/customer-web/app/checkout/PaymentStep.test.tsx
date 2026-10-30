import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"

import type { CreateCheckoutIntentResponse } from "@effy/shared-types"

import { PaymentStep } from "./PaymentStep"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))

// The step asks the platform whether the order is already paid; answer "no" so the card path
// renders. A mock omitting this would make every test here navigate away.
let confirmResult: unknown = { paymentIntent: { status: "requires_payment_method" }, error: undefined }
// Off by default: most tests are about the shell, not a filled-in card.
let cardComplete = false
vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
  ok: true,
  json: async () => (String(url).includes("confirm") ? { paid: false } : { paymentMethods: [] }),
})))

// The three PCI-scoped inputs are provider iframes; stand them in with labelled boxes so the shell
// which is the part Effy owns and this feature is about - can be asserted.
function cardField(testId: string) {
  return function CardField({ onChange }: { onChange?: (e: { complete: boolean }) => void }) {
    useEffect(() => {
      if (cardComplete) onChange?.({ complete: true })
      // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the real element reports on load
    }, [])
    return <div data-testid={testId} />
  }
}

vi.mock("@stripe/react-stripe-js", () => ({
  useStripe: () => ({ confirmCardPayment: async () => confirmResult }),
  useElements: () => ({ getElement: () => ({}) }),
  CardNumberElement: cardField("card-number"),
  CardExpiryElement: cardField("card-expiry"),
  CardCvcElement: cardField("card-cvc"),
  // The wallet row shares this module. A mock missing it makes every PaymentStep test throw
  // - the same stale-mock failure `CheckoutFlow.address.test.tsx` hit when PaymentForm was replaced.
  // Reports no wallet, which is the branch this suite wants: US1's assertions are about the card path.
  ExpressCheckoutElement: ({ onReady }: { onReady: (e: unknown) => void }) => {
    onReady({})
    return null
  },
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
   * The reason this feature exists.
   *
   * The payment step must carry the amount and nothing else. This asserts the absence of order content,
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
   * Three fields, and the three that are absent matter more than the three
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

  /** The figure shown is the figure from the server, never one the client computed. */
  it("shows the server's amount, and shows it on the pay control", () => {
    render(<PaymentStep intent={intent({ grandTotalAmount: "23.05" })} onBack={vi.fn()} />)

    expect(screen.getByText("$23.05")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /pay \$23\.05/i })).toBeInTheDocument()
  })

  /**
   * The control cannot be pressed until there is something to pay with. The old form let a
   * shopper submit an empty card form and find out from the provider.
   */
  it("keeps the pay control disabled until the card fields are complete", () => {
    render(<PaymentStep intent={intent()} onBack={vi.fn()} />)
    expect(screen.getByRole("button", { name: /pay \$14\.60/i })).toBeDisabled()
  })

  /** Exactly one route back, and it does not lose the basket. */
  it("offers one clearly-labelled route back to checkout", () => {
    const onBack = vi.fn()
    render(<PaymentStep intent={intent()} onBack={onBack} />)
    expect(screen.getByRole("button", { name: /back to checkout/i })).toBeInTheDocument()
  })

  /** `busy` clears on every outcome (a `finally`), so the control never stays on "Processing…". */
  it("clears the busy state on every outcome, including success", async () => {
    cardComplete = true
    const assign = vi.fn()
    vi.stubGlobal("location", { ...window.location, assign, origin: "http://localhost" })
    try {
      for (const status of ["succeeded", "processing", "requires_payment_method"]) {
        confirmResult = { paymentIntent: { status }, error: undefined }
        const { unmount } = render(<PaymentStep intent={intent()} onBack={vi.fn()} />)
        const pay = await screen.findByRole("button", { name: /pay \$/i })
        await waitFor(() => expect(pay).toBeEnabled())
        fireEvent.click(pay)
        // The control returns to a usable label rather than staying on "Paying…".
        await waitFor(() => expect(screen.getByRole("button", { name: /pay \$/i })).toBeEnabled())
        unmount()
      }
      expect(assign).toHaveBeenCalledTimes(2)
    } finally {
      cardComplete = false
      vi.unstubAllGlobals()
    }
  })

  /** The pay rail is a storefront card (white, hairline border, `rounded-lg`). */
  it("lays the pay rail out as the storefront card", () => {
    const { container } = render(<PaymentStep intent={intent()} onBack={vi.fn()} />)
    const aside = container.querySelector("aside")
    expect(aside).not.toBeNull()
    expect(aside!.className).toMatch(/\brounded-lg\b/)
    expect(aside!.className).toMatch(/\bbg-card\b/)
    expect(aside!.className).not.toMatch(/\bbg-(muted|primary|foreground)\b/)
  })
})
