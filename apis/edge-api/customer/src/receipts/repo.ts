import { query } from "@effy/edge-shared"

/** The rate limit, the insert and the ownership join are one statement; zero rows is the refusal. */

export interface EnqueueResendInput {
  orderId: string
  /** Never a value from the request body. */
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

/** "Not yours" and "does not exist" fall out of one scoped lookup; only then are other refusals safe to state. */
export async function enqueueResend(input: EnqueueResendInput): Promise<EnqueueResendResult> {
  const found = await query<{ status: string; email: string | null }>(
    `SELECT o.status, c.email
       FROM public."order" o
       JOIN public.customer c ON c.id = o.customer_id
      WHERE o.id = $1 AND c.cognito_sub = $2`,
    [input.orderId, input.cognitoSub],
  )
  const order = found.rows[0]
  // "No such order" and "someone else's" alike.
  if (!order) return { status: "not_found" }
  if (order.status !== "paid") return { status: "not_paid" }
  // Cannot occur (customer.email is not null); declared for the client.
  if (!order.email) return { status: "no_recipient" }

  // Zero rows: the cap was hit and nothing was enqueued.
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
