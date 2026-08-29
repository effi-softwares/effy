// "Is this order finished, and if so tell the customer" — ONE implementation, two callers (053).
//
// ⚠ WHY THIS IS SHARED AND NOT WRITTEN TWICE. Two services now complete a package: `edge-api/driver`
// (an Effy driver's same-day drop, closed with proof) and `edge-api/orders` (a back-office record of
// a carrier delivery). Both must ask the SAME question afterwards — has the whole order arrived? —
// and both must answer it identically. Principle II: cross-cutting logic is shared, never copied.
//
// ⚠ AND IT FIXES A LIVE DEFECT WHILE IT IS AT IT. Before 053, `edge-api/driver` enqueued
// `order_delivered` on completing a DROP, deduped on the drop id:
//
//     'order_delivered:' || c.cognito_sub || ':' || dt.id
//
// A drop covers one order's SAME-DAY packages. So a mixed order — one shop same-day, another
// standard — told the customer "Delivered. Your order has been delivered." while the standard half
// was still with a carrier. Spec FR-007 is explicit that an order is finished only when EVERY
// package has arrived, and FR-020 that the customer is told exactly once. Both were being broken by
// the same line.
//
// The rule here is a ROLLUP, NOT A MAX — the same rule `core-api`'s `orders/stage.go` applies to the
// customer's progress word, for the same reason: a customer has not received their order until all
// of it has arrived.

import type pg from "pg";

/**
 * Enqueue the customer's "your order arrived" intents — but ONLY if this was the last package.
 *
 * Call inside the SAME transaction as the arrival it follows, so the intent and the fact it
 * announces commit together or not at all.
 *
 * Writes one row per channel (research R8):
 *   • push  — to the customer's registered devices; `skipped` when there is no token, which is not
 *             a failure.
 *   • email — ⚠ the channel that reaches a shopper who has never installed the app (FR-019). The
 *             address is SNAPSHOTTED HERE, at enqueue, never resolved at send: a customer who later
 *             changes their account email must not retroactively redirect a message about an order
 *             that has already arrived (052's rule).
 *
 * Both keys are ORDER-scoped, so the two callers cannot double-announce one order, and
 * `ON CONFLICT (dedupe_key) DO NOTHING` makes a repeat a no-op (FR-020).
 *
 * @returns true when the order is now complete (whether or not this call was the one to enqueue).
 */
export async function enqueueOrderDeliveredIfComplete(
  tx: pg.PoolClient,
  orderId: string,
): Promise<boolean> {
  // Complete ⇔ no package of this order is still without an arrival row. Asked as "does an
  // unarrived package exist?" so a partially-arrived order answers false with one index probe.
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

  // ⚠ No PII in `payload`, on either channel (050 FR-021) — routing ids only. The email branch
  // resolves what it renders at send time from the order id; it does not carry a name or an address
  // through the outbox.
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
        -- An email intent with nowhere to send is refused by a CHECK; skip it rather than fail the
        -- whole arrival over a customer with no address on file.
        AND (ch.channel <> 'email' OR c.email IS NOT NULL)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [orderId],
  );
  return true;
}
