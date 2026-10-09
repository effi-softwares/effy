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
// The rule here is a ROLLUP, NOT A MAX — the same rule `stageFor` (below) applies to the customer's
// progress word, for the same reason: a customer has not received their order until all
// of it has arrived.

import type { Queryable } from "./db";

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
  tx: Queryable,
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

// ── What the customer is told about an order (052, 053, 055) ─────────────────────────────────────
//
// ⚠ ONE IMPLEMENTATION, TWO READERS (070). The shopper's own order page (`edge-api/commerce`) and the
// back-office console (`edge-api/orders`) both show this word — the console so that support never
// reassures someone about a status they cannot see. One function serves both, so they cannot differ.

export type CustomerOrderStage = "confirmed" | "packing" | "on_the_way" | "delivered";

/**
 * Where each package status sits on the customer's journey.
 *
 * ⚠ `ready_for_pickup` SCORES 1, NOT 2 (053 FR-016). Under hub-and-spoke it means packed and sitting
 * on a shelf at the shop, waiting for the next collection round — which can be the following day.
 * It has not left, and "on the way" is a claim the business has not earned. `collected` is 2: a
 * driver has it and the shop does not.
 */
const STAGE_RANK: Record<string, number> = {
  pending: 0,
  received: 1,
  picking: 1,
  ready_for_pickup: 1,
  collected: 2,
  delivered: 3,
};
const STAGE_BY_RANK: readonly CustomerOrderStage[] = ["confirmed", "packing", "on_the_way", "delivered"];

/**
 * Collapse every package's status into the ONE word the customer is shown.
 *
 * ⚠ A ROLLUP, NOT A MAX: the order is only as far along as its LEAST advanced package. One package
 * delivered and one still being picked is `packing` — `delivered` would tell someone their shopping
 * is on the doorstep while half of it is on a shelf.
 *
 * It discloses no fulfilment structure: how many packages there are, and each one's state, never
 * leave this function.
 */
export function stageFor(statuses: readonly string[]): CustomerOrderStage {
  if (statuses.length === 0) return "confirmed"; // paid, nothing has moved
  let least = 3;
  for (const s of statuses) {
    // An unrecognised status scores 0: a status this build has never heard of must not be able to
    // advance anyone's view of an order.
    least = Math.min(least, STAGE_RANK[s] ?? 0);
  }
  return STAGE_BY_RANK[least]!;
}

/**
 * Did moving some packages change what the CUSTOMER is shown? (071 FR-025)
 *
 * `after` is every package's status now; `before` is the same list with the moved packages set
 * back to where they were. The answer is whether the one word on the customer's order page changed.
 *
 * ⚠ THIS IS WHY A SPLIT ORDER LOOKS LIKE ANY OTHER (FR-024). The stage is the LEAST advanced
 * package's, so when the faster of two shops packs or hands over, nothing the customer sees has
 * changed and they are told nothing. They hear exactly as many times, at exactly the moments, that
 * a single-shop order would have told them — the count and timing of updates cannot reveal that a
 * second shop exists.
 */
export function customerViewChanged(before: readonly string[], after: readonly string[]): boolean {
  return stageFor(before) !== stageFor(after);
}

/**
 * May the SHOPPER still cancel this order themselves? (055 FR-012)
 *
 * ⚠ ADVISORY, NOT THE GATE. The cancel itself re-decides this under the order's row lock, because a
 * shop can begin picking between the read and the tap. This exists so the control is not offered
 * when it obviously cannot work.
 *
 * ⚠ The window closes when ANY shop begins, not when all have: a two-shop order where one has
 * started picking is already partly real work.
 */
export function customerCancellable(orderStatus: string, statuses: readonly string[]): boolean {
  // An unpaid order has no money to return; a cancelled one is already cancelled.
  if (orderStatus !== "paid") return false;
  // Paid and not yet fanned out is the most cancellable an order ever is.
  return statuses.every((s) => s === "pending");
}

// ── Refund states, as two different questions ────────────────────────────────────────────────────

/**
 * Which SETTLED-ENOUGH refunds count against what may still be refunded — what a console DISPLAYS
 * as "refunded so far".
 *
 * ⚠ `submitting` is OUT: no money is on its way yet. ⚠ `failed` is IN: it is money the platform
 * attempted to return and staff must resolve — freeing the ceiling would let a bouncing retry
 * refund an order repeatedly.
 *
 * ⚠ The ceiling a refund is actually ISSUED against (`payments/refunds/repository.ts`) is this set
 * PLUS a refund that is in flight at that very moment. That extra term exists for a few seconds at
 * a time and is deliberately not shown: a console that counted it would flicker the remaining
 * amount on every refund, and would be wrong the instant it settled either way.
 */
export const COUNTED_REFUND_STATUSES: readonly string[] = ["submitted", "succeeded", "failed"];

export type CustomerRefundState = "on_its_way" | "completed" | "there_was_a_problem";

/**
 * A refund's state as the SHOPPER reads it: five internal states become three.
 *
 * ⚠ `failed` and `refused` both read "there was a problem", deliberately without saying what: the
 * provider's reason is staff information a shopper cannot act on.
 * ⚠ AN UNKNOWN STATE READS "ON ITS WAY", NEVER "COMPLETED". A state this build has never heard of
 * must not tell a shopper their money has arrived — the one claim that stops them looking for it.
 */
export function customerRefundState(internal: string): CustomerRefundState {
  if (internal === "succeeded") return "completed";
  if (internal === "failed" || internal === "refused") return "there_was_a_problem";
  return "on_its_way";
}

/**
 * Does this refund count toward "what you have been refunded", on the shopper's own order page?
 *
 * ⚠ NOT THE CEILING'S RULE, and the difference is `failed`. The ceiling counts a failed refund so
 * staff must resolve it; the shopper's total must NOT, because that money did not reach them.
 * `submitting` is out of both: asked for and unconfirmed has not left.
 */
export const countsAsRefundedToCustomer = (internal: string): boolean =>
  internal !== "submitting" && customerRefundState(internal) !== "there_was_a_problem";
