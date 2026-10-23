import { logger } from "@effy/edge-shared"

import { enqueueResend, type EnqueueResendResult } from "./repo"

/** Enqueues one `receipt_dispatch` row; the notifications worker sends. The recipient is never from the request. */

const env = process.env

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

  // The order id and the outcome, never the address.
  logger.info({ orderId, outcome: result.status }, "receipt resend requested")
  return result
}
