/**
 * Recording a payment: the one place an order becomes paid. Reached from the provider's notification,
 * the shopper's return, and a later checkout that finds an earlier order paid; its effects happen
 * exactly once.
 *
 * One transaction, the caller's (so the webhook's "handled" record rolls back with any failure), and
 * the first statement is the guard: `UPDATE … WHERE status = 'pending_payment'`. A racing delivery
 * waits on the row lock, then matches nothing and does nothing. Nothing below adds a guard of its own.
 */
import type { Queryable } from "../lib/db";
import { recordDeliveryType } from "../delivery/delivery-type";
import { slotLoad } from "../delivery/slots";
import { createFirstParcels } from "../labels/parcels";
import { emitMetric } from "../lib/metrics";
import { announce, type LiveChange } from "../live";
import { release as releasePoints, spendHeld } from "../points/ledger";
import { confirmUses, releaseUses } from "../promotions/uses";
import { appendNotification } from "./outbox";

export interface FinalizeOutcome {
  /** False when the order was not pending (a redelivery): nothing ran. */
  applied: boolean;
  /** The order's window place was confirmed. */
  slotConfirmed: boolean;
  /** A late payer honoured above the slot's capacity. Alarmed. */
  slotOverCapacity: boolean;
  /** An oversell: more was ordered than the shop had. The pick line is pre-flagged. */
  stockShortfall: boolean;
  /** Whose screens this payment changes, for routing only. Empty / null when nothing was applied. */
  shopIds: readonly string[];
  customerSub: string | null;
  /** The shops whose tracked stock this sale reduced. */
  stockShopIds: readonly string[];
  /** Points spent by this order (0 when none). */
  pointsSpent: number;
  /** Points held at checkout that were gone when the payment landed. The order stands; alarmed. */
  pointsShortfall: number;
  /** Who delivers the order; null when nothing was applied. */
  deliveryType: "effy" | "courier" | null;
}

const NOT_APPLIED: FinalizeOutcome = {
  applied: false, slotConfirmed: false, slotOverCapacity: false, stockShortfall: false, shopIds: [], customerSub: null, stockShopIds: [],
  pointsSpent: 0, pointsShortfall: 0, deliveryType: null,
};

/**
 * Turns the held window place into a booking. A hold lasts minutes and bank authentication can outlast
 * it: a lapsed hold on a since-filled slot is honoured and flagged `over_capacity`, since the shopper
 * has paid. The slot row is locked first, in the same order as the hold.
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
  if (!held) return { confirmed: false, overCapacity: false };

  const slot = (
    await tx.query<{ capacity: number | null }>(`SELECT capacity FROM public.delivery_slot WHERE id = $1 FOR UPDATE`, [held.slot_id])
  ).rows[0];
  if (!slot) throw new Error("finalize: booked slot no longer exists");
  // null: the slot has no limit.
  const capacity = slot.capacity;

  const live = (
    await tx.query<{ live: boolean }>(`SELECT held_until > now() AS live FROM public.delivery_slot_booking WHERE order_id = $1`, [orderId])
  ).rows[0]?.live === true;

  let overCapacity = false;
  if (!live && capacity !== null) {
    // The lapsed hold no longer counts, so this is everyone else holding a place.
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

/** Runs the paid transition inside the caller's transaction. */
export async function finalizeSucceeded(tx: Queryable, orderId: string): Promise<FinalizeOutcome> {
  // The guard. Zero rows means already finalised.
  const paid = await tx.query(
    `UPDATE public."order" SET status='paid', placed_at=now() WHERE id=$1 AND status='pending_payment'`,
    [orderId],
  );
  if ((paid.rowCount ?? 0) === 0) return NOT_APPLIED;

  // One shop_fulfillment per shop. `subtotal_amount` is customer money; `shop_subtotal_amount` is the same goods at the shop's prices.
  await tx.query(
    `
INSERT INTO public.shop_fulfillment
    (order_id, shop_id, item_count, subtotal_amount, shop_subtotal_amount)
SELECT oi.order_id, oi.shop_id, SUM(oi.quantity)::int, SUM(oi.line_subtotal_amount),
       SUM(oi.shop_line_subtotal_amount)
FROM public.order_item oi
WHERE oi.order_id = $1
GROUP BY oi.order_id, oi.shop_id
ON CONFLICT (order_id, shop_id) DO NOTHING`,
    [orderId],
  );

  // Bag 1 of every package, carrying the package's own code.
  await createFirstParcels(tx, { orderId });

  // Each package's delivery method. No fee: delivery is priced per order.
  await tx.query(
    `
UPDATE public.shop_fulfillment sf
SET delivery_method = opd.method,
    updated_at      = now()
FROM public.order_package_delivery opd
WHERE opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id AND sf.order_id = $1`,
    [orderId],
  );

  // The first entry of the order's delivery-type history, in this transaction.
  await recordDeliveryType(tx, { orderId, actor: { kind: "checkout" } });

  const slot = await confirmSlotBooking(tx, orderId);

  // Held points become `spent`, under the customer's points lock (taken after the order row's). If they
  // went elsewhere meanwhile, what is usable is spent and the rest is recorded as a shortfall.
  const points = await spendHeld(tx, orderId, new Date());
  if (points.shortfallPoints > 0) {
    await tx.query(
      `UPDATE public."order"
          SET points_shortfall_amount = points_shortfall_amount + ($2::int * COALESCE(points_cents_per_point, 1))::numeric / 100
        WHERE id = $1`,
      [orderId, points.shortfallPoints],
    );
  }

  // Lock the variant rows before reading the shelf, so two payments for the last unit cannot both
  // see it. `ORDER BY v.id` avoids deadlocks between overlapping baskets.
  await tx.query(
    `
SELECT v.id FROM public.product_variant v
 WHERE v.stock_tracked
   AND v.id IN (SELECT oi.variant_id FROM public.order_item oi WHERE oi.order_id = $1)
 ORDER BY v.id
   FOR UPDATE OF v`,
    [orderId],
  );

  // Flag the shortfall before deducting: after the deduction the shelf reads 0. Pick rows are created
  // with the deficit already unavailable.
  const flagged = await tx.query(
    `
INSERT INTO public.fulfillment_item
    (shop_fulfillment_id, order_item_id, ordered_quantity, unavailable_quantity)
SELECT sf.id, oi.id, oi.quantity,
       LEAST(oi.quantity, oi.quantity - COALESCE(v.stock_on_hand, 0))
  FROM public.order_item oi
  JOIN public.shop_fulfillment sf ON sf.order_id = oi.order_id AND sf.shop_id = oi.shop_id
  JOIN public.product_variant v ON v.id = oi.variant_id
 WHERE oi.order_id = $1
   AND v.stock_tracked
   AND oi.quantity > COALESCE(v.stock_on_hand, 0)
ON CONFLICT (shop_fulfillment_id, order_item_id) DO NOTHING`,
    [orderId],
  );

  // Stock. `GREATEST(0, …)` keeps a negative count impossible despite the locks; `prev` carries the
  // before-value into the movement. Untracked variants match nothing.
  const stockMoved = await tx.query<{ shop_id: string }>(
    `
WITH ordered AS (
    SELECT oi.variant_id, oi.shop_id, SUM(oi.quantity)::int AS qty
      FROM public.order_item oi
     WHERE oi.order_id = $1
     GROUP BY oi.variant_id, oi.shop_id
), prev AS (
    SELECT v.id, v.product_id, o.shop_id, v.stock_on_hand, o.qty
      FROM public.product_variant v
      JOIN ordered o ON o.variant_id = v.id
     WHERE v.stock_tracked
     ORDER BY v.id
     FOR UPDATE OF v
), moved AS (
    UPDATE public.product_variant v
       SET stock_on_hand = GREATEST(0, prev.stock_on_hand - prev.qty)
      FROM prev
     WHERE v.id = prev.id
    RETURNING v.id, prev.product_id, prev.shop_id, prev.stock_on_hand AS before, v.stock_on_hand AS after
)
INSERT INTO public.stock_movement
    (product_id, variant_id, shop_id, quantity_delta, quantity_before, quantity_after, reason, actor_kind, actor_sub, order_id)
SELECT product_id, id, shop_id, after - before, before, after, 'order_paid', 'system', NULL, $1
  FROM moved
RETURNING shop_id::text AS shop_id`,
    [orderId],
  );

  // "New order to pick": one per active staff member of each shop.
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

  const shopIds = (
    await tx.query<{ shop_id: string }>(`SELECT shop_id::text AS shop_id FROM public.shop_fulfillment WHERE order_id = $1 ORDER BY shop_id`, [orderId])
  ).rows.map((r) => r.shop_id);
  const meta = (
    await tx.query<{ cognito_sub: string; delivery_type: "effy" | "courier" | null }>(
      `
SELECT c.cognito_sub, o.delivery_type
FROM public."order" o JOIN public.customer c ON c.id = o.customer_id WHERE o.id = $1`,
      [orderId],
    )
  ).rows[0];
  if (!meta) throw new Error("finalize: order has no customer");

  await appendNotification(tx, {
    recipientSub: meta.cognito_sub, audience: "customer", type: "order_paid",
    entityId: orderId, deepLink: `effy://order/${orderId}`,
  });

  // Receipt intent. The recipient is snapshotted now; the notifications worker sends it, so payment
  // never depends on a mail service.
  await tx.query(
    `
INSERT INTO public.receipt_dispatch (order_id, reason, recipient)
SELECT o.id, 'order_paid', c.email
FROM public."order" o JOIN public.customer c ON c.id = o.customer_id
WHERE o.id = $1
ON CONFLICT DO NOTHING`,
    [orderId],
  );

  await tx.query(`UPDATE public.payment SET status='succeeded', updated_at=now() WHERE order_id=$1`, [orderId]);

  // Confirm the promotion uses held at the intent (a lapsed hold too: the shopper paid the discounted price).
  await confirmUses(tx, orderId);

  // Empty the cart and its entered code.
  await tx.query(
    `
DELETE FROM public.cart_item WHERE cart_id = (
    SELECT c.id FROM public.cart c JOIN public."order" o ON o.customer_id = c.customer_id WHERE o.id = $1
)`,
    [orderId],
  );
  await tx.query(
    `UPDATE public.cart SET promotion_code_id = NULL, promo_applied_at = NULL
      WHERE customer_id = (SELECT customer_id FROM public."order" WHERE id = $1)`,
    [orderId],
  );

  return {
    applied: true,
    slotConfirmed: slot.confirmed,
    slotOverCapacity: slot.overCapacity,
    // One occurrence per order, not per line.
    stockShortfall: (flagged.rowCount ?? 0) > 0,
    shopIds,
    customerSub: meta.cognito_sub,
    stockShopIds: [...new Set(stockMoved.rows.map((r) => r.shop_id))],
    pointsSpent: points.spent,
    pointsShortfall: points.shortfallPoints,
    deliveryType: meta.delivery_type,
  };
}

/** Marks the order and its payment failed. The cart is preserved. */
export async function finalizeFailed(tx: Queryable, orderId: string): Promise<void> {
  await tx.query(`UPDATE public."order" SET status='failed', updated_at=now() WHERE id=$1 AND status='pending_payment'`, [orderId]);
  await tx.query(`UPDATE public.payment SET status='failed', updated_at=now() WHERE order_id=$1`, [orderId]);
  // Points and promotion uses held for this checkout are usable again at once.
  await releasePoints(tx, orderId);
  await releaseUses(tx, orderId, "payment_failed");
}

/** The metrics a finalisation raises. After the commit. */
export function meterFinalize(namespace: string, out: FinalizeOutcome): void {
  if (out.slotConfirmed) {
    emitMetric(namespace, "SlotBookings", 1, { outcome: "confirmed" });
    if (out.slotOverCapacity) emitMetric(namespace, "SlotBookings", 1, { outcome: "over_capacity" });
  }
  if (out.applied) emitMetric(namespace, "StockDeducted", 1, { outcome: out.stockShortfall ? "partial" : "full" });
  // Orders placed, by who delivers them.
  if (out.applied && out.deliveryType) emitMetric(namespace, "OrdersPlaced", 1, { deliveryType: out.deliveryType });
  if (out.pointsSpent > 0) emitMetric(namespace, "PointsSpent", 1);
  // Alarmed: Effy absorbed value it did not plan to.
  if (out.pointsShortfall > 0) emitMetric(namespace, "PointsHoldShortfall", 1);
}

/**
 * Tells open apps an order was paid: its shops, its customer and operations. After the commit; never
 * throws. A redelivery applies nothing and announces nothing.
 */
export async function announcePaid(out: FinalizeOutcome): Promise<void> {
  if (!out.applied) return;
  const changes: LiveChange[] = out.shopIds.map((shopId) => ({ scope: "shop", shopId, kind: "orders" }));
  for (const shopId of out.stockShopIds) changes.push({ scope: "shop", shopId, kind: "stock" });
  if (out.customerSub) changes.push({ scope: "customer", sub: out.customerSub, kind: "orders" });
  // The customer's points balance moved too.
  if (out.customerSub && out.pointsSpent > 0) changes.push({ scope: "customer", sub: out.customerSub, kind: "points" });
  changes.push({ scope: "ops", kind: "orders" });
  if (out.slotConfirmed) changes.push({ scope: "ops", kind: "slots" });
  await announce(changes);
}
