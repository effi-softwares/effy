import { logger } from "@effy/edge-shared"
import { sendEmail } from "@effy/email-kit/send"

/**
 * "Your password changed": the only control that catches a takeover that succeeded. Never a reset link
 * (a phishing primitive, into an inbox that may be the attacker's). Swallows failure by its declared
 * policy, since the change cannot be undone, but logs it loudly.
 */
export async function notifyPasswordChanged(input: {
  to: string
  /** True for the customer's first password. */
  isFirstPassword: boolean
}): Promise<void> {
  await sendEmail(
    "account-password-changed",
    { isFirstPassword: input.isFirstPassword },
    { to: input.to, audience: "customer" },
    logger,
  )
}
