import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * What payment telemetry may never carry. The type union in `lib/telemetry.ts` enforces it; this source
 * check catches a later widening of those shapes (a compile-time change no runtime test would notice).
 */
describe("payment telemetry", () => {
  const source = readFileSync(join(process.cwd(), "lib/telemetry.ts"), "utf8")

  /** The payment event block, with comments stripped (they name the forbidden fields to explain them). */
  const stripComments = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

  const paymentEvents = stripComments(
    source.slice(
      source.indexOf("// Payment. Never"),
      source.indexOf("// Customer experience refresh."),
    ),
  )
  const declarations = stripComments(source)

  it("declares the payment events it is supposed to", () => {
    for (const name of [
      "payment_method_selected",
      "payment_succeeded",
      "payment_failed",
      "payment_abandoned_at_provider",
      "saved_card_used",
      "card_saved",
      "card_removed",
    ]) {
      expect(paymentEvents).toContain(name)
    }
  })

  /**
   * The assertion this file exists for. None of these may become a prop, and each one is a real
   * temptation: last4 "to segment by network", amount "to measure basket value at failure",
   * paymentMethodId "to join with Stripe".
   */
  it("cannot carry a card reference, an amount, or a provider identifier", () => {
    const forbidden = [
      "last4",
      "cardNumber",
      "cvc",
      "paymentMethodId",
      "customerId",
      "stripeCustomerId",
      "amount",
      "declineCode",
      "decline_code",
    ]
    for (const field of forbidden) {
      expect(paymentEvents).not.toContain(field)
    }
  })

  /**
   * The method is a family, not a provider name. "Klarna at 11pm by this subject id" is a record of
   * someone's credit decision; "instalments" answers the product question without holding it.
   */
  it("records a method family rather than a named provider", () => {
    for (const provider of ["klarna", "zip", "afterpay", "applePay", "googlePay"]) {
      expect(paymentEvents.toLowerCase()).not.toContain(provider.toLowerCase())
    }
    expect(declarations).toContain("PaymentMethodFamily")
  })

  /** Effy's own coarse reason, never the provider's code. */
  it("records a coarse failure reason in Effy's own vocabulary", () => {
    expect(declarations).toContain("PaymentFailureReason")
    for (const code of ["insufficient_funds", "do_not_honor", "generic_decline"]) {
      expect(declarations).not.toContain(code)
    }
  })
})
