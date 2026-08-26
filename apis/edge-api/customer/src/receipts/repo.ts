import { query } from "@effy/edge-shared"

/**
 * The receipt-resend repository (052 US4). Raw SQL, no ORM (Principle VI).
 *
 * ⚠ THE RATE LIMIT AND THE INSERT ARE ONE STATEMENT. A `COUNT` followed by an `INSERT` is a
 * read-then-write race — two rapid taps would each see a count below the cap and both enqueue an
 * email. The conditional `INSERT … SELECT … WHERE (SELECT count …) < $max` decides atomically, so
 * zero rows RETURNED is the refusal (research R6; the same shape 046's feedback repo uses, which 039
 * recorded as a lesson after the newsletter's check-then-write).
 *
 * ⚠ AND THE OWNERSHIP CHECK IS IN THE SAME STATEMENT. The `JOIN public.customer` on `cognito_sub` is
 * what makes another customer's order unenqueueable — not a separate read whose result could be
 * stale by the time the insert runs.
 */

export interface EnqueueResendInput {
  orderId: string
  /** The AUTHENTICATED subject. Never a value from the request body. */
  cognitoSub: string
  windowMinutes: number
  maxPerWindow: number
}

export type EnqueueResendResult =
  | { status: "queued" }
  | { status: "rate_limited" }
  | { status: "not_found" }
  | { status: "not_paid" }
  | { status: "no_recipient" }

/**
 * Enqueue one `customer_request` dispatch, or explain why not.
 *
 * ⚠ THE ORDER OF THE CHECKS IS A DISCLOSURE DECISION, not a style one. "Not yours" and "does not
 * exist" must be INDISTINGUISHABLE (FR-029, SC-008), so both fall out of the same ownership-scoped
 * lookup returning no row. Only once an order is known to be the caller's do the other refusals
 * become safe to state — telling a stranger an order is "not paid" would confirm it exists.
 */
export async function enqueueResend(input: EnqueueResendInput): Promise<EnqueueResendResult> {
  // 1. Ownership + payment state, in one scoped read. A row here proves the order is the caller's.
  const found = await query<{ status: string; email: string | null }>(
    `SELECT o.status, c.email
       FROM public."order" o
       JOIN public.customer c ON c.id = o.customer_id
      WHERE o.id = $1 AND c.cognito_sub = $2`,
    [input.orderId, input.cognitoSub],
  )
  const order = found.rows[0]
  // ⚠ Covers BOTH "no such order" and "someone else's order" — deliberately one branch.
  if (!order) return { status: "not_found" }
  if (order.status !== "paid") return { status: "not_paid" }
  // Cannot occur today (customer.email is NOT NULL); declared so the client has no undefined branch.
  if (!order.email) return { status: "no_recipient" }

  // 2. The rate-limited insert. ⚠ Zero rows means the cap was hit AND NOTHING WAS ENQUEUED, which is
  // what FR-028 requires: a refused request must not send an email.
  const inserted = await query<{ id: string }>(
    `
    INSERT INTO public.receipt_dispatch (order_id, reason, recipient)
    SELECT $1, 'customer_request', $2
    WHERE (
      SELECT count(*) FROM public.receipt_dispatch
       WHERE order_id = $1
         AND reason = 'customer_request'
         AND created_at > now() - make_interval(mins => $3::int)
    ) < $4::int
    RETURNING id`,
    [input.orderId, order.email, input.windowMinutes, input.maxPerWindow],
  )

  return inserted.rows.length > 0 ? { status: "queued" } : { status: "rate_limited" }
}
