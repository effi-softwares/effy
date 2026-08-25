import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * ⚠ SC-012 / Principle VII — what payment telemetry may NEVER carry.
 *
 * The type union in `lib/telemetry.ts` is the real enforcement: a `props` shape that has no field for
 * a card reference cannot carry one, and adding it fails the build. This test guards the OTHER half —
 * that nobody widens those shapes later without noticing what they are widening.
 *
 * ⚠ Why a source assertion rather than a runtime one: the failure mode is a well-meaning future edit
 * ("let's add last4 so we can segment by network"), which is a compile-time change. There is no
 * runtime moment at which it goes wrong — it just quietly starts shipping card data to an analytics
 * store, and no test that captures events would notice, because the event would be perfectly valid.
 */
describe("payment telemetry (051 T097)", () => {
  const source = readFileSync(join(process.cwd(), "lib/telemetry.ts"), "utf8")

  /**
   * The payment event block, with COMMENTS STRIPPED.
   *
   * ⚠ Stripping is not cosmetic — the first version of this test failed against its own documentation,
   * because the comments explaining why `amount` and `insufficient_funds` are forbidden contain those
   * very words. A guard that cannot tell a banned field from a note explaining the ban is a guard that
   * punishes writing the note.
   */
  const stripComments = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

  const paymentEvents = stripComments(
    source.slice(
      source.indexOf("// 051 payment experience."),
      source.indexOf("// 025 customer experience refresh."),
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
   * ⚠ THE ASSERTION THIS FILE EXISTS FOR. None of these may become a prop, and each one is a real
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
   * ⚠ The method is a FAMILY, not a provider name. "Klarna at 11pm by this subject id" is a record of
   * someone's credit decision; "instalments" answers the product question without holding it.
   */
  it("records a method family rather than a named provider", () => {
    for (const provider of ["klarna", "zip", "afterpay", "applePay", "googlePay"]) {
      expect(paymentEvents.toLowerCase()).not.toContain(provider.toLowerCase())
    }
    expect(declarations).toContain("PaymentMethodFamily")
  })

  /** Effy's own coarse reason, never the provider's code (SC-012). */
  it("records a coarse failure reason in Effy's own vocabulary", () => {
    expect(declarations).toContain("PaymentFailureReason")
    for (const code of ["insufficient_funds", "do_not_honor", "generic_decline"]) {
      expect(declarations).not.toContain(code)
    }
  })
})
