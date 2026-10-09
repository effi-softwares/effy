import type { DeliveryType, DeliveryTypeReason } from "@effy/shared-types";

import type { Queryable } from "../lib/db";

/**
 * Who takes a package to the customer, as a SQL expression: `'effy'` or `'courier'`, for every order
 * there has ever been (079 research R2).
 *
 * ⚠ THE DECISION IS `public.package_delivered_by`'S AND NOBODY ELSE'S. Before 079 "a standard
 * package with a window is Effy's" was spelled `slot_id IS NULL` in five places across the orders
 * service; a sixth reader that forgot it would have handed an Effy parcel to a carrier. Pass the
 * aliases of the order row, the package's method and its slot — and select or compare the result.
 * `delivery-type.guard.test.ts` fails a reader that goes back to deciding from the window.
 */
export const deliveredBySql = (orderAlias: string, method: string, slotId: string): string =>
  `public.package_delivered_by(${orderAlias}.delivery_type, ${method}, ${slotId})`;

/**
 * The same answer for a shop's PORTION of an order (`shop_fulfillment`), for callers that hold the
 * portion and not its captured delivery row — the shop service.
 *
 * ⚠ THE WINDOW IS LOOKED UP IN HERE, ON PURPOSE. A shop is never told when the customer's delivery
 * is (069), and a guard keeps the shop service from so much as naming the column that says so. It
 * does not need to: it asks who takes the package away, and the database works that out from a fact
 * the shop never sees. Pass the aliases of the order row and the fulfilment row.
 */
export const fulfilmentDeliveredBySql = (orderAlias: string, fulfilmentAlias: string): string =>
  deliveredBySql(
    orderAlias,
    `${fulfilmentAlias}.delivery_method`,
    `(SELECT d.slot_id FROM public.order_package_delivery d
       WHERE d.order_id = ${fulfilmentAlias}.order_id AND d.shop_id = ${fulfilmentAlias}.shop_id)`,
  );

/** Who did it: the checkout itself, at payment — or a member of staff. */
export type DeliveryTypeActor = { kind: "checkout" } | { kind: "staff"; sub: string };

export interface DeliveryTypeChange {
  to: DeliveryType;
  reason: DeliveryTypeReason;
  /** The courier's timeframe as the customer is now told it. Required when `to` is `courier`. */
  courierEstimate: string | null;
  note: string | null;
}

export interface RecordDeliveryTypeInput {
  orderId: string;
  actor: DeliveryTypeActor;
  /**
   * Absent: record the FIRST entry — the type the checkout decided, as the order already carries it.
   * Present: move the order to another type and record that.
   */
  change?: DeliveryTypeChange;
}

/**
 * ⚠ THE ONE WRITER of an order's delivery-type history, and — once an order is paid — of its type
 * (079 research R7). `delivery-type.guard.test.ts` fails a second one.
 *
 * Runs in the CALLER's transaction: the history row and the order's columns commit together or not
 * at all, with whatever else the caller is doing (the paid transition; later, a staff override and
 * its compensation).
 *
 * Returns whether a row was written.
 *   - The first entry is written at most once however often payment is finalised (a partial unique
 *     index is the conflict target), and never for an order placed before 079 — it has no type, and
 *     its history is not invented.
 *   - A change to the type it already has is not a change.
 *
 * ⚠ It does not announce. The caller does, after its transaction commits (`announceOrder`).
 */
export async function recordDeliveryType(tx: Queryable, input: RecordDeliveryTypeInput): Promise<boolean> {
  const actorSub = input.actor.kind === "staff" ? input.actor.sub : null;

  if (!input.change) {
    const first = await tx.query(
      `
INSERT INTO public.order_delivery_type_change (order_id, from_type, to_type, reason, actor_kind, actor_sub)
SELECT o.id, NULL, o.delivery_type, o.delivery_type_reason, $2, $3
  FROM public."order" o
 WHERE o.id = $1 AND o.delivery_type IS NOT NULL
ON CONFLICT (order_id) WHERE from_type IS NULL DO NOTHING`,
      [input.orderId, input.actor.kind, actorSub],
    );
    return (first.rowCount ?? 0) > 0;
  }

  return (await changeDeliveryType(tx, { ...input, change: input.change })) !== null;
}

/**
 * The same change as `recordDeliveryType` with a `change` — returning the history row it wrote, or
 * null when nothing changed (no such order, an order with no type, or the type it already has).
 *
 * 081 — a staff move records what it adds (the window, the courier, the compensation) against the
 * row that says the move happened, so it needs that row's id. ⚠ Still the one writer: this IS it.
 */
export async function changeDeliveryType(
  tx: Queryable,
  input: RecordDeliveryTypeInput & { change: DeliveryTypeChange },
): Promise<{ changeId: string } | null> {
  const actorSub = input.actor.kind === "staff" ? input.actor.sub : null;
  const { to, reason, note } = input.change;
  // The order row's lock is what makes "from" true: two changes at once are serialised, and the
  // second sees the first's result.
  const current = (
    await tx.query<{ delivery_type: DeliveryType | null }>(`SELECT delivery_type FROM public."order" WHERE id = $1 FOR UPDATE`, [input.orderId])
  ).rows[0];
  if (!current || current.delivery_type === null || current.delivery_type === to) return null;

  const written = (
    await tx.query<{ id: string }>(
      `
INSERT INTO public.order_delivery_type_change (order_id, from_type, to_type, reason, actor_kind, actor_sub, note)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id::text AS id`,
      [input.orderId, current.delivery_type, to, reason, input.actor.kind, actorSub, note],
    )
  ).rows[0]!;
  await tx.query(
    `
UPDATE public."order"
   SET delivery_type = $2, delivery_type_reason = $3, courier_estimate = $4, updated_at = now()
 WHERE id = $1`,
    [input.orderId, to, reason, to === "courier" ? input.change.courierEstimate : null],
  );
  return { changeId: written.id };
}

/**
 * 081 — the staff note (the reason a person gave) on each of these history rows. ⚠ Staff only: the
 * reason is never on a customer or shop contract.
 */
export async function deliveryTypeChangeNotes(q: Queryable, changeIds: readonly string[]): Promise<Map<string, string | null>> {
  if (changeIds.length === 0) return new Map();
  const rows = (
    await q.query<{ id: string; note: string | null }>(
      `SELECT id::text AS id, note FROM public.order_delivery_type_change WHERE id = ANY($1::uuid[])`,
      [changeIds],
    )
  ).rows;
  return new Map(rows.map((r) => [r.id, r.note]));
}
