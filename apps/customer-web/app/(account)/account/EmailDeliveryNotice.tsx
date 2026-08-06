import type { EmailDeliveryState } from "@effy/shared-types"

/**
 * "We can't reach your email address" (037 FR-030).
 *
 * ⚠ THIS IS THE ONLY PLACE THE PLATFORM SAYS IT OUT LOUD, and that is deliberate.
 *
 * When an address hard-fails once, the mail service records it and thereafter accepts every send and
 * delivers nothing. Before 037 the shopper saw a sign-in screen cheerfully saying "we've sent you a
 * code", waited, and concluded the product was broken. Nobody at Effy knew either.
 *
 * ⚠ WHY NOT ON THE SIGN-IN SCREEN, WHERE IT WOULD HELP MOST. That screen is unauthenticated, and
 * delivery state is only knowable for an address the platform has actually emailed — which implies
 * an account exists. Saying it there would answer *"does this person have an Effy account?"* to
 * anyone who types an address, spending the enumeration defence 035 built (phantom sends to the
 * mailbox simulator, timing parity) to improve a line of copy. The sign-in screens carry a UNIFORM
 * "still not arriving?" line instead, shown to everyone (FR-030a).
 *
 * Here the person has already proven the account is theirs, so there is no oracle to leak.
 *
 * ⚠ NO `reason` AND NO `diagnostic`. Those are the receiving server's own words, written for a
 * postmaster — "smtp;550 5.1.1 user unknown" on an account page is noise at best and alarming at
 * worst. They live in the back-office console, where an operator has asked for them.
 */
export function EmailDeliveryNotice({
  state,
  email,
}: {
  state: EmailDeliveryState
  email: string
}) {
  // The overwhelmingly common case: nothing to say, so say nothing. A permanent banner reporting
  // "your email works" is noise that teaches people to ignore this region of the page.
  if (state === "reachable") return null

  const copy = COPY[state]

  return (
    <section
      // ⚠ The undeliverable state is the only one that uses the error token, and it is NEVER
      // conveyed by colour alone — the heading says what is wrong in words (Principle V).
      className={
        state === "undeliverable"
          ? "rounded-lg border border-destructive/40 bg-destructive/5 p-4"
          : "rounded-lg border border-border bg-muted/40 p-4"
      }
      data-testid="email-delivery-notice"
      aria-labelledby="email-delivery-heading"
    >
      <h2 id="email-delivery-heading" className="text-sm font-semibold">
        {copy.heading}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {copy.body} <span className="font-medium text-foreground">{email}</span>
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {copy.action}{" "}
        <a className="underline underline-offset-2" href="mailto:hello@effyshopping.com">
          hello@effyshopping.com
        </a>
        .
      </p>
    </section>
  )
}

const COPY: Record<Exclude<EmailDeliveryState, "reachable">, {
  heading: string
  body: string
  action: string
}> = {
  undeliverable: {
    heading: "We can't deliver email to your address",
    // ⚠ Says the consequence, not the mechanism. "Your address is on a suppression list" is true and
    // useless; "you won't receive sign-in codes" is what the person actually needs to know.
    body: "Messages we send are being permanently rejected, so you won't receive sign-in codes, receipts or security notices at",
    action: "Update your email address, or write to us from another address at",
  },
  soft_failing: {
    heading: "We're having trouble reaching your email",
    body: "Some of our recent messages could not be delivered to",
    action: "This often clears up on its own. If it doesn't, write to us at",
  },
  complained: {
    // ⚠ NOT phrased as a fault, and NOT a lockout. A complaint usually means someone typed a
    // stranger's address into sign-in — the recipient did nothing wrong, and barring them would lock
    // out an account they may legitimately own (FR-031).
    heading: "One of our emails was reported as spam",
    body: "To be safe we've stopped assuming we can reach",
    action: "If that wasn't you, or you'd like to keep receiving sign-in codes, write to us at",
  },
}
