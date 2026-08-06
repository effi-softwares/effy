// Hourly probe: is the bounce-return configuration still working? (037 FR-038, research R11.)
//
// ⚠ THIS EXISTS BECAUSE AWS PROVIDES NO SIGNAL FOR IT. There is no CloudWatch metric and no
// EventBridge event for a broken custom MAIL FROM — the `aws.ses` event catalogue is per-message
// only. The single documented notification is an email to the AWS ACCOUNT ROOT ADDRESS, which on a
// solo-operator project is exactly as unmonitored as the gap this whole slice is closing.
//
// ⚠ AND THE FAILURE IS SILENT BY CONSTRUCTION. With behavior_on_mx_failure = USE_DEFAULT_VALUE —
// the right setting, because the alternative makes every send fail, i.e. nobody signs in — SES
// quietly falls back to an amazonses.com envelope. Mail keeps flowing. What breaks is SPF
// alignment, so deliverability decays at receivers over DAYS and the rate alarms fire only after
// the damage is done.
//
// ⚠ THE `Failed` STATE IS TERMINAL: SES stops retrying after 72 hours and setup must be restarted
// by hand. So this alarm is not a nicety — it is the only thing standing between a transient DNS
// blip and a permanently degraded sending identity.
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
    logger.error("MAIL_SENDING_DOMAIN is not configured — the MAIL FROM probe cannot run")
    // ⚠ Emit nothing. The alarm treats missing data as BREACHING, so silence trips it — which is
    // the correct outcome for a probe that cannot run. Emitting 0 would be equally correct here;
    // emitting 1 would be a lie, and emitting nothing keeps "cannot run" and "unhealthy"
    // indistinguishable at the alarm, which is what we want.
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
    // Log the error NAME only — the identity name is safe, but SES error text is not a place to be
    // casual about.
    logger.error({ err: err instanceof Error ? err.name : "unknown" }, "identity health probe failed")
    // Same reasoning as above: stay silent and let treat_missing_data = "breaching" do the work.
  }
}
