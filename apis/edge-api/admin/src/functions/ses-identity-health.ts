// Hourly: is the custom mail from still working? AWS gives no metric or event for it. A failure is
// silent (SES falls back to amazonses.com and SPF alignment decays over days), and `Failed` is
// terminal after 72 hours, so this alarm is what catches a DNS blip in time.
import { GetEmailIdentityCommand, SESv2Client } from "@aws-sdk/client-sesv2"
import type { Context } from "aws-lambda"

import { logger } from "@effy/edge-shared"

import { emit } from "../lib/mail-metrics"

let client: SESv2Client | undefined
function ses(): SESv2Client {
  client ??= new SESv2Client({})
  return client
}

export const handler = async (_event: unknown, context: Context): Promise<void> => {
  context.callbackWaitsForEmptyEventLoop = false

  const identity = process.env.MAIL_SENDING_DOMAIN
  if (!identity) {
    logger.error("MAIL_SENDING_DOMAIN is not configured - the MAIL FROM probe cannot run")
    // Emit nothing: the alarm treats missing data as breaching.
    return
  }

  try {
    const res = await ses().send(new GetEmailIdentityCommand({ EmailIdentity: identity }))

    const mailFromStatus = res.MailFromAttributes?.MailFromDomainStatus
    const verified = res.VerifiedForSendingStatus === true
    const dkimOk = res.DkimAttributes?.Status === "SUCCESS"
    const healthy = mailFromStatus === "SUCCESS" && verified && dkimOk

    logger.info({ mailFromStatus, verified, dkimOk, healthy }, "sending identity health")
    emit("mail_from_domain_healthy", { mailFromStatus: mailFromStatus ?? "unknown" }, healthy ? 1 : 0)
  } catch (err) {
    // The error name only.
    logger.error({ err: err instanceof Error ? err.name : "unknown" }, "identity health probe failed")
  }
}
