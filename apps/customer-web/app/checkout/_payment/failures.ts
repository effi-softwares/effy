/**
 * Turning a provider's refusal into something a shopper can act on (051 US5).
 *
 * ⚠ THIS FILE EXISTS BECAUSE "SOMETHING WENT WRONG" IS NOT AN ANSWER. A shopper told only that has no
 * way to decide whether to wait, try a different card, or give up — so they abandon the basket, which
 * is the outcome nobody wanted. Every message below names a cause and points at a next step (FR-036).
 *
 * ⚠ AND BECAUSE A PROVIDER'S OWN STRING IS WRITTEN FOR A DEVELOPER. "Your card was declined" is fine;
 * `payment_intent_authentication_failure` is not, and neither is a raw `decline_code`. Where the
 * provider gives a genuinely shopper-facing sentence we prefer it (it is localised and specific); where
 * it gives a code, we say something useful instead.
 *
 * ⚠ EVERY MESSAGE SAYS WHAT HAPPENED TO THE MONEY. "Nothing has been charged" is the single most
 * useful fact after a failed payment, and it is true on every path here: a refused payment charges
 * nothing, and the basket survives (FR-037).
 */

/** What the shopper should be told, and what they can do about it. */
export type PaymentFailure = {
  /** One sentence naming the cause. */
  title: string
  /** What to do next. Always actionable, never "please try again later" alone. */
  detail: string
  /**
   * Whether retrying the SAME method could plausibly work. A declined card will not start working on
   * a second press, and inviting a retry that cannot succeed wastes the shopper's patience on the
   * screen where they have least of it.
   */
  retryable: boolean
}

const NOTHING_CHARGED = "Nothing has been charged and your basket is still here."

/**
 * Map a provider decline code to Effy's own words.
 *
 * Codes are Stripe's documented `decline_code` values. The set covered here is the set a real shopper
 * actually hits; anything else falls through to a generic-but-still-actionable message rather than
 * being surfaced raw.
 */
export function failureForDeclineCode(code: string | undefined): PaymentFailure | null {
  switch (code) {
    case "insufficient_funds":
      return {
        title: "There aren't enough funds on that card.",
        detail: `${NOTHING_CHARGED} Try a different card, or one of the other ways to pay.`,
        retryable: false,
      }
    case "expired_card":
      return {
        title: "That card has expired.",
        detail: `${NOTHING_CHARGED} Check the expiry date, or use a different card.`,
        retryable: false,
      }
    case "incorrect_cvc":
    case "invalid_cvc":
      return {
        title: "That security code doesn't match the card.",
        detail: `${NOTHING_CHARGED} Check the three digits on the back and try again.`,
        retryable: true,
      }
    case "incorrect_number":
    case "invalid_number":
      return {
        title: "That card number isn't right.",
        detail: `${NOTHING_CHARGED} Check the number and try again.`,
        retryable: true,
      }
    case "card_velocity_exceeded":
      return {
        title: "Your bank has blocked this card for now.",
        detail: `${NOTHING_CHARGED} It's usually a temporary limit — try a different card, or contact your bank.`,
        retryable: false,
      }
    case "do_not_honor":
    case "generic_decline":
    case "transaction_not_allowed":
      return {
        title: "Your bank declined this card.",
        detail: `${NOTHING_CHARGED} Your bank can say why. Try a different card, or one of the other ways to pay.`,
        retryable: false,
      }
    case "lost_card":
    case "stolen_card":
      // ⚠ Deliberately vague, and that is not an oversight. Stripe's own guidance is not to tell the
      // person at the keyboard that a card was reported lost or stolen — they may not be the
      // cardholder. The message is truthful without being an alert to a thief.
      return {
        title: "Your bank declined this card.",
        detail: `${NOTHING_CHARGED} Try a different card, or contact your bank.`,
        retryable: false,
      }
    default:
      return null
  }
}

/**
 * The failure a shopper is shown, from whatever the provider returned.
 *
 * `providerMessage` is Stripe's own `error.message`. It is preferred over a generic sentence because it
 * is localised and specific — but only when a decline code has not already given us something better.
 */
export function failureFor(input: {
  declineCode?: string
  providerMessage?: string
}): PaymentFailure {
  const byCode = failureForDeclineCode(input.declineCode)
  if (byCode) return byCode

  if (input.providerMessage) {
    return {
      title: input.providerMessage,
      detail: `${NOTHING_CHARGED} Try again, or use a different payment method.`,
      retryable: true,
    }
  }

  return {
    title: "We couldn't take that payment.",
    detail: `${NOTHING_CHARGED} Try again, or use a different payment method.`,
    retryable: true,
  }
}

/** The shopper abandoned at an external provider and came back without paying (US4 scenario 5). */
export const ABANDONED_AT_PROVIDER: PaymentFailure = {
  title: "You came back without finishing.",
  detail: `${NOTHING_CHARGED} Pick up where you left off, or pay another way.`,
  retryable: true,
}

/**
 * The bank wants the shopper to approve the payment (3DS).
 *
 * ⚠ NOT A FAILURE, and it must not read like one. This is the single most common moment a shopper
 * panics and closes the tab — being told in advance that their bank will ask, and that they will be
 * brought back, is what stops that (FR-040).
 */
export const BANK_APPROVAL_REQUIRED = {
  title: "Your bank needs to approve this payment.",
  detail: "They'll ask you to confirm, then bring you straight back here.",
}
