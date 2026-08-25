import { describe, expect, it } from "vitest"

import { ABANDONED_AT_PROVIDER, BANK_APPROVAL_REQUIRED, failureFor } from "./failures"

/**
 * ⚠ SC-007 — 100% of refusals must present a cause a shopper can act on. The failure this guards is the
 * easy one to ship: a `default:` branch that quietly emits "something went wrong", which passes every
 * type check and tells the shopper nothing.
 */
describe("payment failures (051 US5)", () => {
  const CODES = [
    "insufficient_funds",
    "expired_card",
    "incorrect_cvc",
    "invalid_cvc",
    "incorrect_number",
    "invalid_number",
    "card_velocity_exceeded",
    "do_not_honor",
    "generic_decline",
    "transaction_not_allowed",
    "lost_card",
    "stolen_card",
  ]

  it("gives every known decline code its own actionable message", () => {
    const seen = new Set<string>()
    for (const code of CODES) {
      const f = failureFor({ declineCode: code })
      expect(f.title.length).toBeGreaterThan(0)
      expect(f.detail.length).toBeGreaterThan(0)
      seen.add(f.title)
    }
    // ⚠ Not all distinct — lost_card and stolen_card deliberately share wording (see failures.ts) —
    // but a single message covering everything would mean the mapping does nothing.
    expect(seen.size).toBeGreaterThan(4)
  })

  /** ⚠ FR-037 — the most useful fact after a failed payment, and it must appear every time. */
  it("always tells the shopper nothing was charged and the basket survived", () => {
    for (const code of [...CODES, undefined, "some_unmapped_code"]) {
      const f = failureFor({ declineCode: code })
      expect(f.detail).toMatch(/nothing has been charged/i)
      expect(f.detail).toMatch(/basket/i)
    }
    expect(ABANDONED_AT_PROVIDER.detail).toMatch(/nothing has been charged/i)
  })

  /**
   * ⚠ THE ASSERTION THIS FILE EXISTS FOR. No path may produce a bare "something went wrong", and no
   * path may surface a raw provider code as the thing the shopper reads.
   */
  it("never says only 'something went wrong', and never shows a raw code", () => {
    for (const code of [...CODES, undefined, "totally_unknown_code"]) {
      const f = failureFor({ declineCode: code })
      const text = `${f.title} ${f.detail}`
      expect(text).not.toMatch(/something went wrong/i)
      // A raw decline code contains underscores; shopper-facing copy does not.
      expect(f.title).not.toMatch(/_/)
    }
  })

  it("prefers the provider's own sentence over a generic one when there is no code", () => {
    const f = failureFor({ providerMessage: "Your card was declined." })
    expect(f.title).toBe("Your card was declined.")
  })

  /** A code beats a provider string: it lets Effy name the cause specifically. */
  it("prefers a mapped code over the provider's sentence", () => {
    const f = failureFor({
      declineCode: "insufficient_funds",
      providerMessage: "Your card was declined.",
    })
    expect(f.title).toMatch(/funds/i)
  })

  /**
   * ⚠ Retryability is advice, and wrong advice costs the shopper their patience where they have least
   * of it. A declined card does not start working on a second press; a mistyped CVC does.
   */
  it("only invites a retry where one could plausibly work", () => {
    expect(failureFor({ declineCode: "incorrect_cvc" }).retryable).toBe(true)
    expect(failureFor({ declineCode: "insufficient_funds" }).retryable).toBe(false)
    expect(failureFor({ declineCode: "expired_card" }).retryable).toBe(false)
  })

  /**
   * ⚠ FR-040 — a bank approval is NOT a failure and must not read like one. This is where a shopper
   * most often panics and closes the tab.
   */
  it("frames a bank approval as a step, not a refusal", () => {
    const text = `${BANK_APPROVAL_REQUIRED.title} ${BANK_APPROVAL_REQUIRED.detail}`
    expect(text).not.toMatch(/failed|declined|error|wrong/i)
    expect(text).toMatch(/bring you (straight )?back/i)
  })

  /**
   * ⚠ A card reported lost or stolen must NOT be named as such to whoever is at the keyboard — they
   * may not be the cardholder. Stripe's own guidance; the message stays truthful without alerting a
   * thief.
   */
  it("does not tell the person at the keyboard that a card was reported lost or stolen", () => {
    for (const code of ["lost_card", "stolen_card"]) {
      const f = failureFor({ declineCode: code })
      expect(`${f.title} ${f.detail}`).not.toMatch(/lost|stolen|report/i)
    }
  })
})
