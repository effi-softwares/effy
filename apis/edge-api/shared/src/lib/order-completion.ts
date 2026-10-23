// "Is this order finished, and if so tell the customer": one implementation for the driver's proof and
// back-office's recorded arrival. A rollup, not a max: an order is finished only when every package has
// arrived, the same rule `stageFor` applies to the customer's progress word.

import type { Queryable } from "./db";

/**
 * Enqueues "your order arrived" only for the last package, in the arrival's own transaction. One row
 * per channel: push (skipped with no token) and email (the address snapshotted now). Both keys are
 * order-scoped, and `ON CONFLICT (dedupe_key) DO NOTHING` makes a repeat a no-op.
 * @returns true when the order is now complete, whoever enqueued.
 */
export async function enqueueOrderDeliveredIfComplete(
  tx: Queryable,
  orderId: string,
): Promise<boolean> {
  // Complete ⇔ no package lacks an arrival row: one index probe.
  const complete = await tx.query<{ complete: boolean }>(
    `SELECT NOT EXISTS (
       SELECT 1
         FROM public.shop_fulfillment sf
    LEFT JOIN public.package_arrival pa ON pa.shop_fulfillment_id = sf.id
        WHERE sf.order_id = $1
          AND pa.id IS NULL
     ) AS complete`,
    [orderId],
  );
  if (!complete.rows[0]?.complete) return false;

  // Routing ids only, on either channel: the email resolves what it renders at send time.
  await tx.query(
    `INSERT INTO public.notification_request
         (recipient_sub, audience, type, channel, recipient_email, payload, dedupe_key)
     SELECT c.cognito_sub, 'customer', 'order_delivered', ch.channel,
            CASE WHEN ch.channel = 'email' THEN c.email ELSE NULL END,
            jsonb_build_object('entityId', o.id::text, 'deepLink', 'effy://order/' || o.id::text),
            'order_delivered:' || ch.channel || ':' || c.cognito_sub || ':' || o.id::text
       FROM public."order" o
       JOIN public.customer c ON c.id = o.customer_id
      CROSS JOIN (VALUES ('push'), ('email')) AS ch(channel)
      WHERE o.id = $1
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [orderId],
  );
  return true;
}

// What the customer is told: one function for the shopper's page and the back-office console.

export type CustomerOrderStage = "confirmed" | "packing" | "on_the_way" | "delivered";

/** `ready_for_pickup` scores 1, not 2: packed on a shelf, possibly until tomorrow, it has not left. */
const STAGE_RANK: Record<string, number> = {
  pending: 0,
  received: 1,
  picking: 1,
  ready_for_pickup: 1,
  collected: 2,
  delivered: 3,
};
const STAGE_BY_RANK: readonly CustomerOrderStage[] = ["confirmed", "packing", "on_the_way", "delivered"];

/** The one word the customer is shown: the least advanced package's, revealing nothing of the fulfilment structure. */
export function stageFor(statuses: readonly string[]): CustomerOrderStage {
  if (statuses.length === 0) return "confirmed";
  let least = 3;
  for (const s of statuses) {
    // An unrecognised status scores 0, so it can never advance anyone's view.
    least = Math.min(least, STAGE_RANK[s] ?? 0);
  }
  return STAGE_BY_RANK[least]!;
}

/**
 * Did moving these packages change the customer's word? `before` is `after` with the moved packages set
 * back. Because the stage is the least advanced package's, a split order is told exactly as often as a
 * single-shop one.
 */
export function customerViewChanged(before: readonly string[], after: readonly string[]): boolean {
  return stageFor(before) !== stageFor(after);
}

/** Advisory (the cancel re-decides under the row lock). Closes when any shop begins. */
export function customerCancellable(orderStatus: string, statuses: readonly string[]): boolean {
  // Unpaid has nothing to return; cancelled is already cancelled.
  if (orderStatus !== "paid") return false;
  // Paid and not yet fanned out is the most cancellable an order ever is.
  return statuses.every((s) => s === "pending");
}

/**
 * Which refunds count as "refunded so far" against the ceiling: not `submitting` (nothing on its way),
 * but `failed` (staff must resolve it, or a bouncing retry could refund repeatedly). The issuing ceiling
 * also counts a refund in flight at that moment; displaying it would only flicker.
 */
export const COUNTED_REFUND_STATUSES: readonly string[] = ["submitted", "succeeded", "failed"];

export type CustomerRefundState = "on_its_way" | "completed" | "there_was_a_problem";

/** Five states become three. `failed` and `refused` read "there was a problem"; an unknown state reads "ON ITS WAY", never "completed". */
export function customerRefundState(internal: string): CustomerRefundState {
  if (internal === "succeeded") return "completed";
  if (internal === "failed" || internal === "refused") return "there_was_a_problem";
  return "on_its_way";
}

/** Toward "what you have been refunded": unlike the ceiling, `failed` is out (the money did not reach them). */
export const countsAsRefundedToCustomer = (internal: string): boolean =>
  internal !== "submitting" && customerRefundState(internal) !== "there_was_a_problem";
