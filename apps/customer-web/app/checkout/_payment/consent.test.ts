import { describe, expect, it, vi } from "vitest"

import { confirmCardPayment } from "./confirm"

/**
 * A card the shopper declined to keep must not be kept: Effy's checkbox enforces consent. Keeping needs
 * both `setup_future_usage: "off_session"` and `payment_method_data.allow_redisplay: "always"` (without
 * the second a kept card never shows). The unticked case is the real assertion.
 */
describe("save-card consent (051 FR-020/FR-021)", () => {
  type ConfirmOptions = {
    setup_future_usage?: string
    payment_method: {
      allow_redisplay?: string
      billing_details?: { address: { country: string; postal_code: string } }
    }
  }

  function fakeStripe() {
    return {
      confirmCardPayment: vi.fn(async (_secret: string, _options: ConfirmOptions) => ({
        paymentIntent: { status: "succeeded" },
        error: undefined,
      })),
    }
  }

  const base = {
    clientSecret: "cs_1",
    cardNumberElement: {} as never,
    billingDetails: null,
  }

  it("keeps the card ONLY when the shopper ticked the box", async () => {
    const stripe = fakeStripe()
    await confirmCardPayment({ ...base, stripe: stripe as never, saveCard: true })

    const [, options] = stripe.confirmCardPayment.mock.calls[0]!
    expect(options.setup_future_usage).toBe("off_session")
    expect(options.payment_method.allow_redisplay).toBe("always")
  })

  /** The assertion the feature actually rests on. */
  it("sends NEITHER flag when the shopper declined", async () => {
    const stripe = fakeStripe()
    await confirmCardPayment({ ...base, stripe: stripe as never, saveCard: false })

    const [, options] = stripe.confirmCardPayment.mock.calls[0]!
    expect(options.setup_future_usage).toBeUndefined()
    expect(options.payment_method.allow_redisplay).toBeUndefined()
  })

  /**
   * Declining must not cost the shopper the payment. A "you must save a card to pay here"
   * outcome would be a dark pattern, and the failure would look like an unrelated decline.
   */
  it("completes the payment normally when the shopper declines", async () => {
    const stripe = fakeStripe()
    const outcome = await confirmCardPayment({ ...base, stripe: stripe as never, saveCard: false })
    expect(outcome.kind).toBe("succeeded")
  })

  /**
   * The billing details Effy holds must reach the bank on both consent paths. It would be
   * easy to attach them only inside the save branch and never notice.
   */
  it("sends the billing details Effy supplies whether or not the card is kept", async () => {
    for (const saveCard of [true, false]) {
      const stripe = fakeStripe()
      await confirmCardPayment({
        ...base,
        stripe: stripe as never,
        saveCard,
        billingDetails: {
          name: "Jane Smith",
          email: "jane@example.com",
          address: {
            line1: "1 Test St",
            line2: null,
            city: "Richmond",
            state: "VIC",
            postalCode: "3121",
            country: "AU",
          },
        },
      })
      const [, options] = stripe.confirmCardPayment.mock.calls[0]!
      expect(options.payment_method.billing_details?.address.country).toBe("AU")
      expect(options.payment_method.billing_details?.address.postal_code).toBe("3121")
    }
  })
})
