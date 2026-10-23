import type { DeliveryType, DeliveryTypeReason } from "@effy/shared-types";

import type { Queryable } from "../lib/db";

/** The checkout at payment, or a member of staff. */
export type DeliveryTypeActor = { kind: "checkout" } | { kind: "staff"; sub: string };

export interface DeliveryTypeChange {
  to: DeliveryType;
  reason: DeliveryTypeReason;
  /** The courier timeframe the customer is now told; required when `to` is `courier`. */
  courierEstimate: string | null;
  note: string | null;
}

export interface RecordDeliveryTypeInput {
  orderId: string;
  actor: DeliveryTypeActor;
  /** Absent: record the first entry (the type the checkout decided). Present: move the order and record that. */
  change?: DeliveryTypeChange;
}

/**
 * The one writer of an order's delivery-type history and, once paid, of its type, in the caller's
 * transaction. The first entry is written at most once (a partial unique index); a change to the type
 * it already has writes nothing. Returns whether a row was written. Does not announce.
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

/** As `recordDeliveryType` with a `change`, returning the row it wrote (or null): a staff move hangs its details on it. */
export async function changeDeliveryType(
  tx: Queryable,
  input: RecordDeliveryTypeInput & { change: DeliveryTypeChange },
): Promise<{ changeId: string } | null> {
  const actorSub = input.actor.kind === "staff" ? input.actor.sub : null;
  const { to, reason, note } = input.change;
  // The order row's lock makes "from" true: two changes serialise.
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

/** The staff note on each row. Staff only, never on a customer or shop contract. */
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
