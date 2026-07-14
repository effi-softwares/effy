import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2"

import { logger } from "@effy/edge-shared"

/**
 * "Your password changed" (012 FR-025).
 *
 * ⚠ THIS IS THE ONLY CONTROL THAT CATCHES A *SUCCESSFUL* SILENT TAKEOVER. Every other defence in
 * this slice is about PREVENTING an illegitimate password write. This one exists for the case where
 * one happened anyway — a phished code, a compromised inbox, an insider. If the customer's real
 * address gets a message saying "your password changed" and it wasn't them, they can act. Without
 * it, a successful takeover is completely silent, and the first they learn of it is when they cannot
 * sign in.
 *
 * ⚠⚠ NO RESET LINK IN THIS EMAIL. EVER. ⚠⚠
 *
 * The instinct is to be helpful: "If this wasn't you, click here to reset your password." That link
 * is itself a phishing primitive — it trains customers to click password links in unsolicited mail,
 * which is the exact behaviour every credential-phishing campaign depends on, and it puts a
 * one-click account-recovery affordance into a message that, by hypothesis, may be arriving in an
 * inbox an attacker already controls. Tell them to contact support. Nothing else.
 */

let client: SESv2Client | undefined

function ses(): SESv2Client {
  client ??= new SESv2Client({})
  return client
}

export async function notifyPasswordChanged(input: {
  to: string
  /** True when this is the customer's FIRST password, false when they replaced an existing one. */
  isFirstPassword: boolean
}): Promise<void> {
  const from = process.env.NOTIFY_SENDER
  if (!from) {
    // ⚠ Deliberately NOT fatal. The password has ALREADY been changed by the time we get here — the
    // Cognito write is done and cannot be unwound. Failing the request now would tell the customer
    // their change failed when it did not, which is a worse lie than a missing email.
    //
    // But it is a REAL defect and must be loud: this is a security notification, and its silent
    // absence is exactly the condition under which a takeover goes unnoticed.
    logger.error("NOTIFY_SENDER is unset — the password-change notification was NOT sent (FR-025)")
    return
  }

  const subject = input.isFirstPassword
    ? "A password was added to your Effy account"
    : "Your Effy password was changed"

  const body = [
    input.isFirstPassword
      ? "A password was just added to your Effy account. You can now sign in with either your password or an emailed code."
      : "Your Effy password was just changed.",
    "",
    "For your security, this signed you out on every device.",
    "",
    // No link. See the warning above.
    "If this wasn't you, contact Effy support straight away.",
  ].join("\n")

  try {
    await ses().send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [input.to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Text: { Data: body, Charset: "UTF-8" } },
          },
        },
      }),
    )
  } catch (err) {
    // Same reasoning as above: the credential change is already committed. Log loudly, do not fail
    // the customer's request over a mail-delivery problem they cannot do anything about.
    logger.error({ err }, "password-change notification failed to send (FR-025)")
  }
}
