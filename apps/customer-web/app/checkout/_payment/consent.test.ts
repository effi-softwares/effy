import { describe, expect, it, vi } from "vitest"

import { confirmCardPayment } from "./confirm"

/**
 * ⚠ T068 — THE NEGATIVE THAT MATTERS, and the one a happy-path walk always misses.
 *
 * Spike S2 moved consent enforcement from the provider's own checkbox to Effy's. That is a better
 * design — it is more of our own UI — but it moves the RESPONSIBILITY too: nothing outside this code
 * now prevents a declined card being kept. So the question "is a card the shopper declined actually
 * absent next time?" stops being the provider's guarantee and becomes ours to prove.
 *
 * Two flags carry it, and BOTH are required (research R5):
 *   - `setup_future_usage: "off_session"` — tells the provider to keep the method at all
 *   - `payment_method_data.allow_redisplay: "always"` — tells it the method may be shown back to the
 *     shopper. Without this a kept card exists but never appears in a list, which is the confusing
 *     half-state the docs warn about.
 *
 * A test asserting only the ticked case would pass with the feature broken, because the defect is
 * always something being sent when it should not be. The unticked case is the real assertion.
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

  /** ⚠ The assertion the feature actually rests on. */
  it("sends NEITHER flag when the shopper declined", async () => {
    const stripe = fakeStripe()
    await confirmCardPayment({ ...base, stripe: stripe as never, saveCard: false })

    const [, options] = stripe.confirmCardPayment.mock.calls[0]!
    expect(options.setup_future_usage).toBeUndefined()
    expect(options.payment_method.allow_redisplay).toBeUndefined()
  })

  /**
   * ⚠ Declining must not cost the shopper the payment (FR-021). A "you must save a card to pay here"
   * outcome would be a dark pattern, and the failure would look like an unrelated decline.
   */
  it("completes the payment normally when the shopper declines", async () => {
    const stripe = fakeStripe()
    const outcome = await confirmCardPayment({ ...base, stripe: stripe as never, saveCard: false })
    expect(outcome.kind).toBe("succeeded")
  })

  /**
   * ⚠ FR-016 — the billing details Effy holds must reach the bank on BOTH consent paths. It would be
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
