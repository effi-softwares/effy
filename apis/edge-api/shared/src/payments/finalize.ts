/**
 * RECORDING A PAYMENT. The one place an order becomes paid (070 FR-016).
 *
 * It is reached three ways — the provider's notification, the shopper's return to the site, and a
 * later checkout that finds an earlier order was paid without the platform being told — and
 * however many times and by whichever of them it runs, its effects happen EXACTLY ONCE:
 *
 *   1. the order becomes `paid`                       7. the shopper is notified
 *   2. each fulfilling shop gets its portion          8. a receipt is queued
 *   3. the same-day place is confirmed                9. the payment is marked succeeded
 *   4. lines the shop cannot fully supply are flagged 10. the promo redemption is recorded
 *   5. stock is reduced, with a movement record       11. the cart is emptied
 *   6. shop staff are notified; order.placed is recorded
 *   3′. (074) the points held at checkout are spent
 *
 * ⚠ ALL OF IT IS ONE TRANSACTION ON ONE CONNECTION, AND THE FIRST STATEMENT IS THE GUARD. Step 1 is
 * `UPDATE … WHERE status = 'pending_payment'`. Two deliveries race on that row's lock: one changes
 * it, the other waits, then matches nothing and returns having done nothing. Everything below the
 * guard relies on it and adds no guard of its own — a second one would imply the first cannot be
 * trusted while the whole transaction depends on it.
 *
 * ⚠ IT TAKES THE CALLER'S TRANSACTION rather than opening one, so the payment webhook can record
 * "this event has been handled" in the SAME transaction (FR-023): if any step here fails, that
 * record rolls back with it and the provider's retry is processed instead of discarded.
 *
 * ⚠ THE ORDER OF THE STEPS IS LOAD-BEARING in two places, both marked below.
 */
import type { Queryable } from "../lib/db";
import { formatCents, parseCents } from "../lib/money";
import { recordDeliveryType } from "../delivery/delivery-type";
import { slotLoad } from "../delivery/slots";
import { emitMetric } from "../lib/metrics";
import { announce, type LiveChange } from "../live";
import { release as releasePoints, spendHeld } from "../points/ledger";
import { appendEvent, appendNotification } from "./outbox";

export interface FinalizeOutcome {
  /** False when the order was not pending — a redelivery. Nothing below ran. */
  applied: boolean;
  /** The order's same-day place was confirmed. */
  slotConfirmed: boolean;
  /** The late payer: honoured above the slot's capacity. The alert watches this. */
  slotOverCapacity: boolean;
  /**
   * ⚠ TRUE IS AN OVERSELL: the order asked for more of something than the shop had, so a shopper
   * has paid for units that do not exist. The shop is told at once (the pick line is pre-flagged).
   */
  stockShortfall: boolean;
  /**
   * Whose screens this payment changes (071): the shops now holding a portion of the order, and the
   * customer's token subject. Routing only — used to tell open apps to re-read, never sent to them.
   * Empty / null when nothing was applied.
   */
  shopIds: readonly string[];
  customerSub: string | null;
  /** The shops whose tracked stock this sale reduced — their stock screens are now out of date. */
  stockShopIds: readonly string[];
  /** 074 — points spent by this order (0 when it used none). */
  pointsSpent: number;
  /**
   * 074 — ⚠ THE LATE PAYER: points the customer held at checkout that were no longer there when the
   * payment landed. The order stands and Effy absorbs the value; the alarm watches this.
   */
  pointsShortfall: number;
  /**
   * 079 — who delivers the order just placed; null for one sold by the checkout that predates the
   * new delivery model (it has no delivery type), and when nothing was applied.
   */
  deliveryType: "effy" | "courier" | null;
}

const NOT_APPLIED: FinalizeOutcome = {
  applied: false, slotConfirmed: false, slotOverCapacity: false, stockShortfall: false, shopIds: [], customerSub: null, stockShopIds: [],
  pointsSpent: 0, pointsShortfall: 0, deliveryType: null,
};

/**
 * Turn the order's HELD same-day place into a confirmed booking.
 *
 * ⚠ THE LATE PAYER. A hold lasts minutes; a bank's authentication step can outlast it. If the hold
 * lapsed and the slot has since filled, the shopper has nevertheless PAID for that window, so the
 * booking is honoured and flagged `over_capacity` rather than refused after the money has moved.
 * The slot row is locked first — the same lock, taken in the same order, as the hold at intent.
 */
async function confirmSlotBooking(tx: Queryable, orderId: string): Promise<{ confirmed: boolean; overCapacity: boolean }> {
  const held = (
    await tx.query<{ slot_id: string; delivery_date: string }>(
      `
SELECT slot_id::text AS slot_id, delivery_date::text AS delivery_date FROM public.delivery_slot_booking
WHERE order_id = $1 AND state = 'held'`,
      [orderId],
    )
  ).rows[0];
  if (!held) return { confirmed: false, overCapacity: false }; // no same-day package

  const slot = (
    await tx.query<{ capacity: number | null }>(`SELECT capacity FROM public.delivery_slot WHERE id = $1 FOR UPDATE`, [held.slot_id])
  ).rows[0];
  if (!slot) throw new Error("finalize: booked slot no longer exists");
  // null = the slot has no limit, so nobody can be over it.
  const capacity = slot.capacity;

  const live = (
    await tx.query<{ live: boolean }>(`SELECT held_until > now() AS live FROM public.delivery_slot_booking WHERE order_id = $1`, [orderId])
  ).rows[0]?.live === true;

  let overCapacity = false;
  if (!live && capacity !== null) {
    // The lapsed hold is not in this count (it stopped counting when it lapsed), so this is
    // everyone ELSE who now has a place.
    overCapacity = ((await slotLoad(tx, held.delivery_date)).get(held.slot_id) ?? 0) >= capacity;
  }

  await tx.query(
    `
UPDATE public.delivery_slot_booking
SET state = 'confirmed', held_until = NULL, over_capacity = $2, updated_at = now()
WHERE order_id = $1`,
    [orderId, overCapacity],
  );
  return { confirmed: true, overCapacity };
}

/** Run the paid transition inside the caller's transaction. See the file header. */
export async function finalizeSucceeded(tx: Queryable, orderId: string): Promise<FinalizeOutcome> {
  // 1. THE GUARD. Zero rows means already finalised — an idempotent no-op.
  const paid = await tx.query(
    `UPDATE public."order" SET status='paid', placed_at=now() WHERE id=$1 AND status='pending_payment'`,
    [orderId],
  );
  if ((paid.rowCount ?? 0) === 0) return NOT_APPLIED;

  // 2. Fan-out — one shop_fulfillment per fulfilling shop. `subtotal_amount` stays CUSTOMER money
  //    (the portions sum to the order's item subtotal); `shop_subtotal_amount` is the same goods at
  //    the shop's prices, which is what the shop is shown (067).
  await tx.query(
    `
INSERT INTO public.shop_fulfillment
    (order_id, shop_id, item_count, subtotal_amount, shop_subtotal_amount)
SELECT oi.order_id, oi.shop_id, SUM(oi.quantity)::int, SUM(oi.line_subtotal_amount),
       SUM(COALESCE(oi.shop_line_subtotal_amount, oi.line_subtotal_amount))
FROM public.order_item oi
WHERE oi.order_id = $1
GROUP BY oi.order_id, oi.shop_id
ON CONFLICT (order_id, shop_id) DO NOTHING`,
    [orderId],
  );

  // 2b. Copy the captured per-package delivery METHOD onto each fulfilment (047).
  //     ⚠ No fee is copied (077): delivery is priced once per order and lives on the order. A
  //     fulfilment is a shop's portion, and a shop is never shown what delivery cost.
  //     ⚠ `promised_ready_at` IS DELIBERATELY NOT SET (069 research R2). The package's promised day
  //     is the CUSTOMER'S DELIVERY DAY; copying it would tell a shop that an order for next Thursday
  //     is not due until next Thursday, when a standard package waits at the HUB, not at the shop.
  await tx.query(
    `
UPDATE public.shop_fulfillment sf
SET delivery_method = opd.method,
    updated_at      = now()
FROM public.order_package_delivery opd
WHERE opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id AND sf.order_id = $1`,
    [orderId],
  );

  // 2b″. 079 — the order's delivery type becomes a fact with a history: the first entry, "decided by
  //      the checkout". ⚠ Through the one writer, in THIS transaction — the order is paid and has its
  //      history, or neither. Nothing is written for an order with no type (sold by the checkout
  //      that predates the new delivery model): its history is not invented.
  await recordDeliveryType(tx, { orderId, actor: { kind: "checkout" } });

  // 2c. The same-day place becomes a booking (069).
  const slot = await confirmSlotBooking(tx, orderId);

  // 2c″. 074 — the points HELD at the payment-intent call become a `spent` entry, under the customer's
  //      points lock (taken AFTER the order row's — the platform's one lock order). If the hold lapsed
  //      and the points went elsewhere meanwhile, what is still usable is spent and the rest is
  //      recorded as a shortfall: the customer paid the card amount they were shown, so the order
  //      stands, nobody is charged again, and the balance never goes negative (research R3).
  const points = await spendHeld(tx, orderId, new Date());
  if (points.shortfallPoints > 0) {
    await tx.query(
      `UPDATE public."order"
          SET points_shortfall_amount = points_shortfall_amount + ($2::int * COALESCE(points_cents_per_point, 1))::numeric / 100
        WHERE id = $1`,
      [orderId, points.shortfallPoints],
    );
  }

  // 2c′. ⚠ THE STOCK ROWS ARE LOCKED BEFORE THEY ARE READ (070). The backend this replaces read the
  //      shelf in 2d with no lock and locked only in 2e, so two payments for the last unit BOTH read
  //      "1 on the shelf", neither flagged a shortfall, and the second shopper's missing unit was
  //      discovered at the shelf instead of on the pick list. With the lock taken first, the second
  //      payment's 2d runs after the first has committed and sees the shelf as it now is.
  //      ⚠ `ORDER BY p.id` is a DEADLOCK guard: two orders with overlapping baskets must take their
  //      row locks in the same sequence, or each can hold what the other needs.
  await tx.query(
    `
SELECT p.id FROM public.product p
 WHERE p.stock_tracked
   AND p.id IN (SELECT oi.product_id FROM public.order_item oi WHERE oi.order_id = $1)
 ORDER BY p.id
   FOR UPDATE OF p`,
    [orderId],
  );

  // 2d. ⚠ ORDER MATTERS: THE OVERSELL IS FLAGGED BEFORE ANYTHING IS DEDUCTED (054 FR-022a).
  //     The deficit is `ordered − what was on the shelf`, and after 2e the shelf reads 0 — computed
  //     afterwards it would report the whole line as short instead of the units actually missing.
  //     The pick rows are created with the deficit ALREADY marked unavailable, so the shop sees it
  //     on opening the order rather than discovering it at the shelf.
  const flagged = await tx.query(
    `
INSERT INTO public.fulfillment_item
    (shop_fulfillment_id, order_item_id, ordered_quantity, unavailable_quantity)
SELECT sf.id, oi.id, oi.quantity,
       LEAST(oi.quantity, oi.quantity - COALESCE(p.stock_on_hand, 0))
  FROM public.order_item oi
  JOIN public.shop_fulfillment sf ON sf.order_id = oi.order_id AND sf.shop_id = oi.shop_id
  JOIN public.product p ON p.id = oi.product_id
 WHERE oi.order_id = $1
   AND p.stock_tracked
   AND oi.quantity > COALESCE(p.stock_on_hand, 0)
ON CONFLICT (shop_fulfillment_id, order_item_id) DO NOTHING`,
    [orderId],
  );

  // 2e. STOCK (054 FR-021/FR-022).
  //     ⚠ `GREATEST(0, …)` IS THE FLOOR, IN THE STATEMENT, and it stays even though 2c′ already
  //     holds the locks: the floor is what makes a negative count impossible, not merely unlikely.
  //     The `prev` CTE carries the before-value out so the movement records what happened.
  //     Untracked products match nothing here and produce no movement.
  const stockMoved = await tx.query<{ shop_id: string }>(
    `
WITH ordered AS (
    SELECT oi.product_id, oi.shop_id, SUM(oi.quantity)::int AS qty
      FROM public.order_item oi
     WHERE oi.order_id = $1
     GROUP BY oi.product_id, oi.shop_id
), prev AS (
    SELECT p.id, o.shop_id, p.stock_on_hand, o.qty
      FROM public.product p
      JOIN ordered o ON o.product_id = p.id
     WHERE p.stock_tracked
     ORDER BY p.id
     FOR UPDATE OF p
), moved AS (
    UPDATE public.product p
       SET stock_on_hand = GREATEST(0, prev.stock_on_hand - prev.qty)
      FROM prev
     WHERE p.id = prev.id
    RETURNING p.id, prev.shop_id, prev.stock_on_hand AS before, p.stock_on_hand AS after
)
INSERT INTO public.stock_movement
    (product_id, shop_id, quantity_delta, quantity_before, quantity_after, reason, actor_kind, actor_sub, order_id)
SELECT id, shop_id, after - before, before, after, 'order_paid', 'system', NULL, $1
  FROM moved
RETURNING shop_id::text AS shop_id`,
    [orderId],
  );

  // 6a. "New order to pick" — one intent per active staff member of each fulfilling shop (050).
  await tx.query(
    `
INSERT INTO public.notification_request (recipient_sub, audience, type, payload, dedupe_key)
SELECT ss.cognito_sub, 'shop', 'shop_new_order',
       jsonb_build_object('entityId', sf.id::text, 'deepLink', 'effy://queue/' || sf.id::text),
       'shop_new_order:' || ss.cognito_sub || ':' || sf.id::text
FROM public.shop_fulfillment sf
-- availability-exempt: public.shop_staff — who may be notified, not what may be sold.
JOIN public.shop_staff ss ON ss.shop_id = sf.shop_id AND ss.status = 'active'
WHERE sf.order_id = $1
ON CONFLICT (dedupe_key) DO NOTHING`,
    [orderId],
  );

  // 6b. order.placed, with the per-shop breakdown (recorded; see outbox.ts for the known gap).
  const shops = (
    await tx.query<{ shop_id: string; item_count: number; subtotal: string }>(
      `
SELECT shop_id::text AS shop_id, item_count, subtotal_amount::text AS subtotal
FROM public.shop_fulfillment WHERE order_id = $1 ORDER BY shop_id`,
      [orderId],
    )
  ).rows.map((r) => ({ shopId: r.shop_id, itemCount: r.item_count, subtotal: r.subtotal }));
  const meta = (
    await tx.query<{ order_number: string; currency: string; grand_total: string; cognito_sub: string; delivery_type: "effy" | "courier" | null }>(
      `
SELECT o.order_number, o.currency, o.grand_total_amount::text AS grand_total, c.cognito_sub, o.delivery_type
FROM public."order" o JOIN public.customer c ON c.id = o.customer_id WHERE o.id = $1`,
      [orderId],
    )
  ).rows[0];
  if (!meta) throw new Error("finalize: order has no customer");

  await appendEvent(tx, {
    eventType: "order.placed",
    dedupKey: `order.placed:${orderId}`,
    aggregateType: "order",
    aggregateId: orderId,
    payload: {
      orderId, orderNumber: meta.order_number, currency: meta.currency,
      grandTotal: formatCents(parseCents(meta.grand_total)), shops,
    },
  });

  // 7. The shopper's order is paid (050).
  await appendNotification(tx, {
    recipientSub: meta.cognito_sub, audience: "customer", type: "order_paid",
    entityId: orderId, deepLink: `effy://order/${orderId}`,
  });

  // 8. Receipt-email intent (052).
  //    ⚠ THE RECIPIENT IS SNAPSHOTTED HERE, not resolved at send time: a customer who later changes
  //    their email must not retroactively change where an already-sent receipt went.
  //    ⚠ It does NOT send. The notifications worker drains this; a mail call on the paid path would
  //    make a payment's success depend on a mail service being up.
  await tx.query(
    `
INSERT INTO public.receipt_dispatch (order_id, reason, recipient)
SELECT o.id, 'order_paid', c.email
FROM public."order" o JOIN public.customer c ON c.id = o.customer_id
WHERE o.id = $1
ON CONFLICT DO NOTHING`,
    [orderId],
  );

  // 9. Payment succeeded.
  await tx.query(`UPDATE public.payment SET status='succeeded', updated_at=now() WHERE order_id=$1`, [orderId]);

  // 10. The promotional redemption (027 FR-048). `promo_redemption.order_id` is UNIQUE as a second,
  //     independent guarantee: the database refuses a double count.
  await tx.query(
    `
INSERT INTO public.promo_redemption (promo_code_id, customer_id, order_id, amount)
SELECT o.promo_code_id, o.customer_id, o.id, o.discount_amount
FROM public."order" o
WHERE o.id = $1 AND o.promo_code_id IS NOT NULL
ON CONFLICT (order_id) DO NOTHING`,
    [orderId],
  );

  // 11. Empty the customer's cart.
  await tx.query(
    `
DELETE FROM public.cart_item WHERE cart_id = (
    SELECT c.id FROM public.cart c JOIN public."order" o ON o.customer_id = c.customer_id WHERE o.id = $1
)`,
    [orderId],
  );

  return {
    applied: true,
    slotConfirmed: slot.confirmed,
    slotOverCapacity: slot.overCapacity,
    // ⚠ ONE occurrence per ORDER, not per line: the question is "how often does a shopper pay for
    // something that is not there", and a basket short on three lines is one occurrence of that.
    stockShortfall: (flagged.rowCount ?? 0) > 0,
    shopIds: shops.map((sh) => sh.shopId),
    customerSub: meta.cognito_sub,
    stockShopIds: [...new Set(stockMoved.rows.map((r) => r.shop_id))],
    pointsSpent: points.spent,
    pointsShortfall: points.shortfallPoints,
    deliveryType: meta.delivery_type,
  };
}

/** Mark the order and its payment failed. No fan-out, no outbox, and the cart is preserved. */
export async function finalizeFailed(tx: Queryable, orderId: string): Promise<void> {
  await tx.query(`UPDATE public."order" SET status='failed', updated_at=now() WHERE id=$1 AND status='pending_payment'`, [orderId]);
  await tx.query(`UPDATE public.payment SET status='failed', updated_at=now() WHERE order_id=$1`, [orderId]);
  // 074 — points set aside for this checkout are usable again at once (they would lapse anyway).
  await releasePoints(tx, orderId);
}

/**
 * Emit the metrics a finalisation raises. Called AFTER the transaction has committed — an outcome
 * that rolled back did not happen and must not be counted.
 */
export function meterFinalize(namespace: string, out: FinalizeOutcome): void {
  if (out.slotConfirmed) {
    emitMetric(namespace, "SlotBookings", 1, { outcome: "confirmed" });
    if (out.slotOverCapacity) emitMetric(namespace, "SlotBookings", 1, { outcome: "over_capacity" });
  }
  if (out.applied) emitMetric(namespace, "StockDeducted", 1, { outcome: out.stockShortfall ? "partial" : "full" });
  // 079 FR-039 — orders placed, by who delivers them. Nothing for an order with no delivery type.
  if (out.applied && out.deliveryType) emitMetric(namespace, "OrdersPlaced", 1, { deliveryType: out.deliveryType });
  if (out.pointsSpent > 0) emitMetric(namespace, "PointsSpent", 1);
  // ⚠ Alarmed (PointsHoldShortfall ≥ 1): Effy absorbed value it did not plan to.
  if (out.pointsShortfall > 0) emitMetric(namespace, "PointsHoldShortfall", 1);
}

/**
 * Tell open apps that an order has been paid (071): each shop now holding a portion of it, the
 * customer who placed it, and operations — whose slot load it may also have changed.
 *
 * ⚠ Called AFTER the transaction has committed, like `meterFinalize`, and for the same reason. It
 * never throws: the order is paid whether or not anyone is told (FR-006). A redelivered webhook
 * applies nothing and so announces nothing.
 */
export async function announcePaid(out: FinalizeOutcome): Promise<void> {
  if (!out.applied) return;
  const changes: LiveChange[] = out.shopIds.map((shopId) => ({ scope: "shop", shopId, kind: "orders" }));
  for (const shopId of out.stockShopIds) changes.push({ scope: "shop", shopId, kind: "stock" });
  if (out.customerSub) changes.push({ scope: "customer", sub: out.customerSub, kind: "orders" });
  // 074 — the customer's balance moved too. Decided from this ORDER, like the update above.
  if (out.customerSub && out.pointsSpent > 0) changes.push({ scope: "customer", sub: out.customerSub, kind: "points" });
  changes.push({ scope: "ops", kind: "orders" });
  if (out.slotConfirmed) changes.push({ scope: "ops", kind: "slots" });
  await announce(changes);
}
