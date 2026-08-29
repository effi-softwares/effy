import { logger } from "@effy/edge-shared"

import { enqueueResend, type EnqueueResendResult } from "./repo"

/**
 * The receipt-resend service (052 US4, FR-027/FR-028/FR-029).
 *
 * ⚠ IT ENQUEUES; IT DOES NOT SEND. One `receipt_dispatch` row, then return. The scheduled worker in
 * `edge-notifications` renders and sends. An SES call on this path would make a customer tap wait on
 * a mail service, and would put a second sender in a second service.
 *
 * ⚠ THE RECIPIENT IS NEVER TAKEN FROM THE REQUEST. It is resolved server-side from the authenticated
 * subject (see `repo.ts`). An `email` field in the body would turn an authenticated route into an
 * open relay for a document carrying someone's name, address and purchase history.
 */

const env = process.env

/** Defaults chosen to be generous to a real person and useless to a script. */
const DEFAULT_WINDOW_MINUTES = 60
const DEFAULT_MAX_PER_WINDOW = 3

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export type ResendOutcome = EnqueueResendResult

export async function resendReceipt(orderId: string, cognitoSub: string): Promise<ResendOutcome> {
  const result = await enqueueResend({
    orderId,
    cognitoSub,
    windowMinutes: positiveInt(env.RECEIPT_RESEND_WINDOW_MINUTES, DEFAULT_WINDOW_MINUTES),
    maxPerWindow: positiveInt(env.RECEIPT_RESEND_MAX_PER_WINDOW, DEFAULT_MAX_PER_WINDOW),
  })

  // ⚠ NO PII IN THE LOG — the order id and the outcome, never the address the receipt goes to
  // (Principle VII: no PII in telemetry beyond the auth subject id).
  logger.info({ orderId, outcome: result.status }, "receipt resend requested")
  return result
}
