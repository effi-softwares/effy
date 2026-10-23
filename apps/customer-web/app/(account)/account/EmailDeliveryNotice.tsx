import type { EmailDeliveryState } from "@effy/shared-types"

/**
 * "We can't reach your email address". After a hard bounce the mail service accepts every send and
 * delivers nothing, so the account page says so. Only here: on the unauthenticated sign-in screen it
 * would reveal that an account exists (those screens carry a uniform "still not arriving?" line). The
 * receiving server's reason and diagnostic stay in back-office.
 */
export function EmailDeliveryNotice({
  state,
  email,
}: {
  state: EmailDeliveryState
  email: string
}) {
  // Nothing to say, so nothing shown: a permanent "your email works" banner teaches people to ignore this spot.
  if (state === "reachable") return null

  const copy = COPY[state]

  return (
    <section
      // The only state using the error token, and its heading says what is wrong in words.
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
    // The consequence, not the mechanism: "you won't receive sign-in codes".
    body: "Messages we send are being permanently rejected, so you won't receive sign-in codes, receipts or security notices at",
    action: "Update your email address, or write to us from another address at",
  },
  soft_failing: {
    heading: "We're having trouble reaching your email",
    body: "Some of our recent messages could not be delivered to",
    action: "This often clears up on its own. If it doesn't, write to us at",
  },
  complained: {
    // Not a fault and not a lockout: a complaint usually means someone typed a stranger's address into sign-in.
    heading: "One of our emails was reported as spam",
    body: "To be safe we've stopped assuming we can reach",
    action: "If that wasn't you, or you'd like to keep receiving sign-in codes, write to us at",
  },
}
