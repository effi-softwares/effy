// The delivery-outcome consumer (037) — the only thing on this platform that can see one person
// being locked out.
//
// ⚠ WHAT IT IS FOR. A send to a blocked address returns SUCCESS and a message id and delivers
// nothing. The sign-in screen says "we've sent you a code." For driver, shop and back-office — who
// have no password and no federated route — that is a permanent account lockout with no signal to
// anyone. The rate alarms cannot help: one person never moves a rate.
import type { Context, SNSEvent } from "aws-lambda"

import { logger } from "@effy/edge-shared"

import { parseOutcome, recordOutcome } from "../deliverability/service"
import { emit } from "../lib/mail-metrics"
import { addressFingerprint } from "../lib/mail-metrics"

/**
 * ⚠ THIS HANDLER NEVER THROWS FOR BAD DATA.
 *
 * A throw makes the delivery retry forever, so one unparseable message would take the consumer
 * down — and a dead consumer restores exactly the blindness this feature exists to remove. It
 * throws ONLY when the datastore is unreachable, which is a condition a retry can actually fix.
 *
 * ⚠ EACH RECORD IS INDEPENDENT. One malformed record must not discard the rest of the batch.
 */
export const handler = async (event: SNSEvent, context: Context): Promise<void> => {
  context.callbackWaitsForEmptyEventLoop = false

  for (const record of event.Records) {
    let raw: unknown
    try {
      raw = JSON.parse(record.Sns.Message)
    } catch {
      // Retrying an unparseable payload cannot succeed. Log the SNS message id — never the body,
      // which contains recipient addresses.
      logger.warn({ snsMessageId: record.Sns.MessageId }, "unparseable delivery outcome; dropped")
      continue
    }

    const events = parseOutcome(raw)
    if (events.length === 0) {
      // An event type we do not subscribe to, or a shape we do not recognise. Recorded as a count,
      // ignored as data.
      logger.info({ snsMessageId: record.Sns.MessageId }, "delivery outcome ignored (unhandled type)")
      continue
    }

    for (const e of events) {
      const { recorded, state } = await recordOutcome(e)

      // ⚠ LOG DISCIPLINE (035's rule, applied to the receiving side). Never the address, never the
      // diagnostic — the receiving server's rejection text embeds the recipient. A short SHA-256
      // fingerprint is enough to correlate two log lines about the same person without writing
      // anyone's address into CloudWatch.
      logger.info(
        {
          messageId: e.messageId,
          eventType: e.eventType,
          subType: e.subType,
          state,
          recorded,
          addr: addressFingerprint(e.address),
        },
        "delivery outcome",
      )

      if (!recorded) continue // a duplicate; metrics must not double-count either

      emit("mail_event_received", { eventType: e.eventType })
      if (state === "undeliverable") emit("mail_hard_bounce")
      if (state === "complained") emit("mail_complaint")
    }
  }
}
