import { query, withTransaction } from "@effy/edge-shared"

import { CUSTOMER_COLUMNS, type CustomerRow } from "../customer/model"

/**
 * The account-closure repository (034 US3). Raw SQL, no ORM (Principle VI).
 *
 * Every statement is scoped by the resolved INTERNAL customer id (`public.customer.id`), never a
 * client-supplied value — the caller's `sub` is resolved to that id by the service first.
 */

// ── The blocking predicate (FR-042) ───────────────────────────────────────────────────────────

/**
 * How long a PAID order keeps blocking closure.
 *
 * ⚠ THIS NUMBER HAS BEEN WRONG TWICE, AND IT IS NOT THE GRACE PERIOD. Read before changing it.
 *
 *   Attempt 1 — "block until the order reaches a terminal state". An order's only terminal state is
 *   every `shop_fulfillment` reaching `collected`, and feature 020 shipped that transition behind a
 *   DEV-ONLY STUB WITH NO ROUTE IN ANY ENVIRONMENT (its removal trigger is the driver slice, which
 *   does not exist). So in production nothing ever became terminal, and EVERY customer who had ever
 *   paid for an order would have been permanently undeletable.
 *
 *   Attempt 2 — "bound it at 30 days, matching the grace period". Same dead end in disguise: Effy is
 *   a WEEKLY-RE-BUY grocery platform, so a customer who shops every week is always within 30 days of
 *   an order. The platform's most engaged customers still could never delete.
 *
 * 7 days is the bound because it answers "how long might goods still be in transit?" — a grocery
 * delivery completes in hours. The GRACE PERIOD (30 days) answers a completely different question,
 * "how long may they change their mind?", and the two must not be unified again.
 *
 * ⚠ This is a BACKSTOP, not the primary exit. The fulfilment term below is what should normally
 * clear the block; once the delivery lifecycle can report completion, almost every order will clear
 * in hours and this bound will rarely be reached.
 */
export const IN_TRANSIT_BLOCK_DAYS = 7

export interface BlockingOrderRow {
  id: string
  /** ⚠ `public."order"` calls this `order_number` — the human-facing `EFY-…` reference. */
  order_number: string
  status: string
  created_at: Date
  clears_at: Date
}

/**
 * Orders that block closure, with the facts FR-042 requires the customer to be told.
 *
 * ⚠ THIS READS A HOT-PATH-OWNED TABLE FROM THE COLD PATH — a recorded Principle III exception
 * (plan.md § Complexity Tracking, research R2). Calling `core-api` instead was rejected because it
 * HAS NO CLOUD DEPLOY (local-Docker-only by platform decision), which would leave deletion
 * permanently broken in dev and impossible in production. The read is one narrow, owned predicate;
 * it projects no order data into the account domain.
 *
 * ⚠ `clears_at` is computed IN SQL and is NEVER NULL — FR-042 forbids a block that cannot state its
 * own end, and the DTO's non-nullable field makes such a blocker unrepresentable.
 */
export async function findBlockingOrders(customerId: string): Promise<BlockingOrderRow[]> {
  const res = await query<BlockingOrderRow>(
    `SELECT o.id,
            o.order_number,
            o.status,
            o.created_at,
            -- ⚠ NEVER NULL. FR-042 forbids a block that cannot state when it ends, and the DTO's
            -- non-nullable field makes such a blocker unrepresentable. Both kinds age out on the
            -- same bound; an awaiting-payment order is additionally clearable by the customer.
            o.created_at + ($2 || ' days')::interval AS clears_at
       FROM public."order" o
      WHERE o.customer_id = $1
        AND (
              o.status = 'pending_payment'
           OR (
                o.status = 'paid'
                AND o.created_at > now() - ($2 || ' days')::interval
                -- The fulfilment term. It cannot yet be satisfied in production (see the constant
                -- above), and it is included ANYWAY so the block becomes correct automatically when
                -- the delivery lifecycle lands, rather than needing to be found and rewritten then.
                AND EXISTS (
                      SELECT 1
                        FROM public.shop_fulfillment f
                       WHERE f.order_id = o.id
                         AND f.status <> 'collected'
                    )
              )
            )
      ORDER BY o.created_at DESC`,
    [customerId, String(IN_TRANSIT_BLOCK_DAYS)],
  )
  return res.rows
}

// ── The closure request ───────────────────────────────────────────────────────────────────────

/** How long a closed account can still be recovered. ⚠ NOT the order-block window — see above. */
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

/** The live (uncancelled) request for a customer, or null. */
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
 * Close the account. ONE TRANSACTION — the request row and the state flip must not be separable.
 *
 * ⚠ The blocker re-check belongs in the SERVICE and runs inside this transaction's caller, because
 * an order can be placed between the preview and the confirmation.
 *
 * ⚠ `erase_after` is STORED, not derived. That date is DISCLOSED to the customer (FR-040), and
 * SC-010 requires every claim in the disclosure to be true — deriving it would retroactively move
 * the deadline for people already told a different one if the window is ever changed.
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
 * Cancel a live closure request and reopen the account (FR-041a).
 *
 * ⚠ THIS IS THE ONLY WAY OUT OF THE WINDOW, AND IT IS DELIBERATELY AN EXPLICIT CALL.
 *
 * An earlier design had signing in restore the account implicitly. That is unimplementable — the
 * refusal and the restore run through the SAME identity lookup, so the gate refuses the very request
 * meant to restore — and it is unsafe: anyone holding the customer's token during the window would
 * silently un-delete the account merely by opening the app. Signing in SURFACES the choice; it does
 * not make it.
 *
 * Returns null when there was no live request to cancel, so the service can answer 409 rather than
 * pretending something happened.
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
