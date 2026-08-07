import { logger } from "@effy/edge-shared"
import { sendEmail } from "@effy/email-kit/send"

/**
 * "Your password changed" (012 FR-025), since 038 rendered by `@effy/email-kit`.
 *
 * ⚠ THIS IS THE ONLY CONTROL THAT CATCHES A *SUCCESSFUL* SILENT TAKEOVER. Every other defence in
 * this slice PREVENTS an illegitimate password write. This one exists for the case where one
 * happened anyway — a phished code, a compromised inbox, an insider. If the customer's real address
 * gets a message saying "your password changed" and it wasn't them, they can act.
 *
 * ⚠⚠ NO RESET LINK IN THIS EMAIL. EVER. ⚠⚠ The `account-password-changed` template carries none, by
 * construction — that link is a phishing primitive, and it puts a one-click recovery affordance into
 * a message that, by hypothesis, may be arriving in an inbox an attacker already controls. The rule
 * now lives in the template, not in a comment on a hand-assembled body.
 *
 * ⚠ SWALLOWS on failure, by design, and this is the message's DECLARED policy
 * (`onSendFailure: "swallow"`) rather than local handling: the password has ALREADY been changed and
 * the Cognito write cannot be unwound, so failing the customer's request would tell them their change
 * failed when it did not — a worse lie than a missing email. But its silent absence is exactly the
 * condition under which a takeover goes unnoticed, so the failure is logged LOUDLY. Passing the
 * shared `logger` is what makes `sendEmail` log the failure instead of staying silent.
 */
export async function notifyPasswordChanged(input: {
  to: string
  /** True when this is the customer's FIRST password, false when they replaced an existing one. */
  isFirstPassword: boolean
}): Promise<void> {
  await sendEmail(
    "account-password-changed",
    { isFirstPassword: input.isFirstPassword },
    { to: input.to, audience: "customer" },
    logger,
  )
}
