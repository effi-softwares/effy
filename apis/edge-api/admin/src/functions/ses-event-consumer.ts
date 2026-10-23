// The delivery-outcome consumer: the only thing that sees one person locked out (a send to a blocked
// address succeeds and delivers nothing, and one person never moves a rate).
import type { Context, SNSEvent } from "aws-lambda"

import { logger } from "@effy/edge-shared"

import { parseOutcome, recordOutcome } from "../deliverability/service"
import { emit } from "../lib/mail-metrics"
import { addressFingerprint } from "../lib/mail-metrics"

/** Never throws for bad data (it would retry forever); only when the datastore is unreachable. Each record is independent. */
export const handler = async (event: SNSEvent, context: Context): Promise<void> => {
  context.callbackWaitsForEmptyEventLoop = false

  for (const record of event.Records) {
    let raw: unknown
    try {
      raw = JSON.parse(record.Sns.Message)
    } catch {
      // Log the SNS message id, never the body (it contains addresses).
      logger.warn({ snsMessageId: record.Sns.MessageId }, "unparseable delivery outcome; dropped")
      continue
    }

    const events = parseOutcome(raw)
    if (events.length === 0) {
      // Not a type we subscribe to: counted, ignored.
      logger.info({ snsMessageId: record.Sns.MessageId }, "delivery outcome ignored (unhandled type)")
      continue
    }

    for (const e of events) {
      const { recorded, state } = await recordOutcome(e)

      // Never the address or the diagnostic; a short SHA-256 fingerprint correlates lines.
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

      if (!recorded) continue

      emit("mail_event_received", { eventType: e.eventType })
      if (state === "undeliverable") emit("mail_hard_bounce")
      if (state === "complained") emit("mail_complaint")
    }
  }
}
