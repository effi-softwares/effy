/**
 * 114: stock held for checkouts - the ONLY writer of `public.stock_hold` (`holds.guard.test.ts`).
 *
 * When a shopper presses Pay, each counted size in their order is held for them for the hold time
 * (`housekeeping_settings.stock_hold_min`, admins set it on Settings › Clean-ups). A hold counts only while
 * `held_until > now()`, so one nobody used stops counting by itself - nothing sweeps it. It is deleted when its order
 * ends (`consumeStockHolds` at payment, `releaseStockHolds` when abandoned or failed) or when the next payment start
 * replaces it. A hold never changes `product_variant.stock_on_hand`: that is the shelf the shop counted.
 *
 * The same shape as the delivery-window hold (`delivery_slot_booking.held_until`, serialised by `lockSlot`): the size
 * row is locked first, in the same order `finalizeSucceeded` locks it (`ORDER BY v.id`), so two checkouts for the last
 * unit - or a checkout and a payment - are serialised and cannot deadlock. "Left to sell" is the shelf less OTHER
 * CUSTOMERS' live holds, written once in `lib/availability.ts` (`stockHeldSql`) and imported here.
 */
import { stockHeldSql } from "../lib/availability";
import type { Queryable } from "../lib/db";

/** Used before the settings row exists (it is created by the migration, so in tests only). */
export const STOCK_HOLD_MINUTES_DEFAULT = 15;

export interface HoldStockInput {
  orderId: string;
  /** The order's customer (`customer.id`): whose own holds are not counted against them. */
  customerId: string;
}

export interface HoldStockResult {
  /** False: a counted line could not be held in full; every hold this order had is gone. */
  ok: boolean;
  /** The order has at least one counted size (nothing to hold otherwise). */
  counted: boolean;
  /** Shops whose held numbers changed, for the live update after commit. */
  shopIds: string[];
  /** Earlier holds of this order that had already run out when they were replaced or dropped. */
  lapsedReplaced: number;
  /** Earlier holds of this order that were still live when they were replaced or dropped. */
  liveReplaced: number;
}

export interface ReleaseResult {
  /** Rows deleted. */
  released: number;
  /** Of those, how many had already run out. */
  lapsed: number;
  shopIds: string[];
}

export interface ConsumeResult {
  /** The order had at least one counted size. */
  hadCountedLines: boolean;
  /** A counted line had no live hold covering it when the payment landed: the hold had run out (or never existed). */
  late: boolean;
  /** The holds ended, live and already run out. */
  ended: { live: number; lapsed: number };
  shopIds: string[];
}

async function holdMinutes(tx: Queryable): Promise<number> {
  const row = (await tx.query<{ m: number }>(`SELECT stock_hold_min AS m FROM public.housekeeping_settings WHERE id = 1`)).rows[0];
  return row ? Number(row.m) : STOCK_HOLD_MINUTES_DEFAULT;
}

/** Locks the order's counted sizes, in the one lock order. Returns nothing: the next statement reads fresh. */
async function lockCountedSizes(tx: Queryable, orderId: string): Promise<void> {
  await tx.query(
    `SELECT v.id FROM public.product_variant v
      WHERE v.stock_tracked
        AND v.id IN (SELECT oi.variant_id FROM public.order_item oi WHERE oi.order_id = $1)
      ORDER BY v.id
        FOR UPDATE OF v`,
    [orderId],
  );
}

async function deleteHolds(tx: Queryable, orderId: string): Promise<ReleaseResult> {
  const rows = (
    await tx.query<{ shop_id: string; lapsed: boolean }>(
      `DELETE FROM public.stock_hold h
        USING public.product_variant v
        WHERE h.order_id = $1 AND v.id = h.variant_id
        RETURNING v.shop_id::text AS shop_id, h.held_until <= now() AS lapsed`,
      [orderId],
    )
  ).rows;
  return {
    released: rows.length,
    lapsed: rows.filter((r) => r.lapsed).length,
    shopIds: [...new Set(rows.map((r) => r.shop_id))],
  };
}

/**
 * Holds every counted size of the order for the hold time, in the caller's transaction, or nothing. Replaces whatever
 * the order held before (a changed basket, a retry), so holds are never added on top of each other. Not ok when any
 * counted line asks for more than is left to sell to this customer; then the order's earlier holds are gone too.
 */
export async function holdStock(tx: Queryable, input: HoldStockInput): Promise<HoldStockResult> {
  const minutes = await holdMinutes(tx);
  await lockCountedSizes(tx, input.orderId);

  // Read after the lock: under READ COMMITTED this statement sees every hold committed by a checkout we waited for.
  const lines = (
    await tx.query<{ variant_id: string; shop_id: string; qty: number; left_to_sell: number }>(
      `SELECT v.id::text AS variant_id, v.shop_id::text AS shop_id, o.qty,
              GREATEST(0, COALESCE(v.stock_on_hand, 0) - ${stockHeldSql("v", "$2::uuid")})::int AS left_to_sell
         FROM (SELECT oi.variant_id, SUM(oi.quantity)::int AS qty
                 FROM public.order_item oi WHERE oi.order_id = $1 GROUP BY oi.variant_id) o
         JOIN public.product_variant v ON v.id = o.variant_id
        WHERE v.stock_tracked
        ORDER BY v.id`,
      [input.orderId, input.customerId],
    )
  ).rows;

  const before = await deleteHolds(tx, input.orderId);
  const replaced = { lapsedReplaced: before.lapsed, liveReplaced: before.released - before.lapsed };
  const counted = lines.length > 0;

  if (lines.some((l) => l.qty > l.left_to_sell)) {
    return { ok: false, counted, shopIds: before.shopIds, ...replaced };
  }
  if (counted) {
    await tx.query(
      `INSERT INTO public.stock_hold (order_id, variant_id, customer_id, quantity, held_until)
       SELECT $1::uuid, x.variant_id, $2::uuid, x.qty, now() + make_interval(mins => $5::int)
         FROM unnest($3::uuid[], $4::int[]) AS x(variant_id, qty)`,
      [input.orderId, input.customerId, lines.map((l) => l.variant_id), lines.map((l) => l.qty), minutes],
    );
  }
  return { ok: true, counted, shopIds: [...new Set([...before.shopIds, ...lines.map((l) => l.shop_id)])], ...replaced };
}

/** Ends every hold of the order (abandoned, failed, a refused payment start, an error after holding). */
export async function releaseStockHolds(tx: Queryable, orderId: string): Promise<ReleaseResult> {
  return deleteHolds(tx, orderId);
}

/**
 * At payment (`finalizeSucceeded`, after the shelf was reduced): says whether the payment came late - a counted line
 * with no live hold covering its quantity - then ends the order's holds.
 */
export async function consumeStockHolds(tx: Queryable, orderId: string): Promise<ConsumeResult> {
  const check = (
    await tx.query<{ counted: number; uncovered: number }>(
      `SELECT count(*)::int AS counted,
              count(*) FILTER (WHERE h.order_id IS NULL OR h.held_until <= now() OR h.quantity < o.qty)::int AS uncovered
         FROM (SELECT oi.variant_id, SUM(oi.quantity)::int AS qty
                 FROM public.order_item oi WHERE oi.order_id = $1 GROUP BY oi.variant_id) o
         JOIN public.product_variant v ON v.id = o.variant_id AND v.stock_tracked
         LEFT JOIN public.stock_hold h ON h.order_id = $1 AND h.variant_id = o.variant_id`,
      [orderId],
    )
  ).rows[0] ?? { counted: 0, uncovered: 0 };
  const ended = await deleteHolds(tx, orderId);
  return {
    hadCountedLines: check.counted > 0,
    late: check.uncovered > 0,
    ended: { live: ended.released - ended.lapsed, lapsed: ended.lapsed },
    shopIds: ended.shopIds,
  };
}
