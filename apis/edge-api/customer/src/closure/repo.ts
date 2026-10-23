import { pooled, query, withTransaction } from "@effy/edge-shared"
import { balanceSummary } from "@effy/edge-shared/points"

import { CUSTOMER_COLUMNS, type CustomerRow } from "../customer/model"

/** Every statement is scoped by the resolved internal customer id. */

/**
 * How long a paid order blocks closure: how long goods may still be in transit (hours for groceries,
 * 7 days as a backstop). Not the 30-day grace period, which answers a different question; a longer
 * bound would stop weekly shoppers from ever deleting.
 */
export const IN_TRANSIT_BLOCK_DAYS = 7

export interface BlockingOrderRow {
  id: string
  /** The `EFY-…` reference. */
  order_number: string
  status: string
  created_at: Date
  clears_at: Date
}

/** Projects no order data into the account domain. `clears_at` is computed in SQL and never null: a block must state its end. */
export async function findBlockingOrders(customerId: string): Promise<BlockingOrderRow[]> {
  const res = await query<BlockingOrderRow>(
    `SELECT o.id,
            o.order_number,
            o.status,
            o.created_at,
            -- ⚠ NEVER NULL: a block must state when it ends, and the DTO's non-nullable field makes
            -- any other blocker unrepresentable. Both kinds age out on the
            -- same bound; an awaiting-payment order is additionally clearable by the customer.
            o.created_at + ($2 || ' days')::interval AS clears_at
       FROM public."order" o
      WHERE o.customer_id = $1
        AND (
              o.status = 'pending_payment'
           OR (
                o.status = 'paid'
                AND o.created_at > now() - ($2 || ' days')::interval
                -- The fulfilment term: an order blocks while ANY package is not yet finished.
                -- ⚠ The finished states are LISTED, so a new working state blocks (safe by default)
                -- while a new finished one must be added here deliberately.
                AND EXISTS (
                      SELECT 1
                        FROM public.shop_fulfillment f
                       WHERE f.order_id = o.id
                         AND f.status NOT IN ('delivered', 'unfulfillable', 'withdrawn')
                    )
              )
            )
      ORDER BY o.created_at DESC`,
    [customerId, String(IN_TRANSIT_BLOCK_DAYS)],
  )
  return res.rows
}

/** How long a closed account can be recovered; not the order-block window. */
export const GRACE_PERIOD_DAYS = 30

export interface ClosureRequestRow {
  id: string
  customer_id: string
  requested_at: Date
  erase_after: Date
  verification_method: string
  cancelled_at: Date | null
  cancelled_reason: string | null
}

/** null when there is none. */
export async function findLiveRequest(customerId: string): Promise<ClosureRequestRow | null> {
  const res = await query<ClosureRequestRow>(
    `SELECT id, customer_id, requested_at, erase_after, verification_method,
            cancelled_at, cancelled_reason
       FROM public.customer_closure_request
      WHERE customer_id = $1
        AND cancelled_at IS NULL`,
    [customerId],
  )
  return res.rows[0] ?? null
}

/**
 * One transaction. The service re-checks blockers inside it (an order can arrive after the preview).
 * `erase_after` is stored, not derived: the customer was told that date.
 */
export async function closeAccount(input: {
  customerId: string
  cognitoSub: string
  verificationMethod: "email_code"
}): Promise<{ customer: CustomerRow; eraseAfter: Date }> {
  return withTransaction(async (tx) => {
    const req = await tx.query<{ erase_after: Date }>(
      `INSERT INTO public.customer_closure_request
            (customer_id, erase_after, verification_method)
       VALUES ($1, now() + ($2 || ' days')::interval, $3)
       RETURNING erase_after`,
      [input.customerId, String(GRACE_PERIOD_DAYS), input.verificationMethod],
    )

    const cust = await tx.query<CustomerRow>(
      `UPDATE public.customer
          SET closure_state = 'closing',
              updated_at    = now()
        WHERE cognito_sub = $1
        RETURNING ${CUSTOMER_COLUMNS}`,
      [input.cognitoSub],
    )

    return { customer: cust.rows[0]!, eraseAfter: req.rows[0]!.erase_after }
  })
}

/**
 * The only way out of the window, and an explicit call: signing in shows the choice but never makes
 * it, or anyone holding the token could un-delete the account. null when there was nothing to cancel.
 */
export async function restoreAccount(input: {
  customerId: string
  cognitoSub: string
}): Promise<CustomerRow | null> {
  return withTransaction(async (tx) => {
    const cancelled = await tx.query<{ id: string }>(
      `UPDATE public.customer_closure_request
          SET cancelled_at     = now(),
              cancelled_reason = 'restored_by_customer',
              updated_at       = now()
        WHERE customer_id  = $1
          AND cancelled_at IS NULL
        RETURNING id`,
      [input.customerId],
    )
    if (cancelled.rows.length === 0) return null

    const cust = await tx.query<CustomerRow>(
      `UPDATE public.customer
          SET closure_state = 'open',
              updated_at    = now()
        WHERE cognito_sub = $1
        RETURNING ${CUSTOMER_COLUMNS}`,
      [input.cognitoSub],
    )
    return cust.rows[0] ?? null
  })
}

/** From @effy/edge-shared/points, as the account page shows. Nothing is forfeited by reading it. */
export async function findPointsHeld(customerId: string): Promise<{ points: number; valueCents: number }> {
  const s = await balanceSummary(pooled, customerId, new Date())
  return { points: s.usable, valueCents: s.valueCents }
}
