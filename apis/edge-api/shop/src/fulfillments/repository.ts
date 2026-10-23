// Every statement is bound to the `shopId` gate resolved from the operator's own record, so
// cross-shop access is structurally impossible. Transitions are a guarded conditional UPDATE
// (`where id and shop_id and status = expected`): zero rows means someone else already applied it.

import { query, withTransaction } from "@effy/edge-shared";

import { courierPickups, pickupOf } from "../lib/courier-pickup";

import { DELIVERED_BY_SQL, type DeliveredBy } from "../lib/delivered-by";
import { assertReadyForPickup } from "../parcels/repository";
import { promiseFor, isAtRisk } from "./promise";
import {
  ACTIVE_STATUSES,
  COMPLETED_STATUSES,
  FulfillmentError,
  type FulfillmentDetail,
  type FulfillmentItem,
  type FulfillmentStatus,
  type FulfillmentSummary,
  type QueueState,
} from "./types";

interface SummaryRow {
  id: string;
  order_number: string;
  placed_at: Date;
  status: FulfillmentStatus;
  state_changed_at: Date;
  item_count: number;
  gathered_count: string | null;
  unavailable_count: string | null;
  delivered_by: DeliveredBy;
}

interface DetailRow {
  id: string;
  order_id: string;
  order_number: string;
  placed_at: Date;
  status: FulfillmentStatus;
  state_changed_at: Date;
  delivery_address: Record<string, unknown>;
  delivered_by: DeliveredBy;
}

interface ItemRow {
  order_item_id: string;
  name: string;
  variant_label: string | null;
  variant_code: string | null;
  sku: string | null;
  gtin: string | null;
  storage_key: string | null;
  ordered_quantity: number;
  gathered_quantity: number | null;
  unavailable_quantity: number | null;
}

/**
 * Ordered by the ready-by promise (a fixed offset from placement, so FIFO), with `sf.id` as the
 * tiebreak for a total order. Progress is a left join aggregate. Payment pre-seeds rows for lines the
 * shelf could not supply, so nothing may infer "picking has started" from fulfillment_item rows.
 */
const LIST_QUEUE = `
SELECT sf.id,
       o.order_number,
       o.placed_at,
       sf.status,
       sf.state_changed_at,
       sf.item_count,
       -- Who takes the package away: the one thing a shop is told about delivery.
       ${DELIVERED_BY_SQL} AS delivered_by,
       COALESCE(SUM(fi.gathered_quantity), 0)    AS gathered_count,
       COALESCE(SUM(fi.unavailable_quantity), 0) AS unavailable_count
  FROM public.shop_fulfillment sf
  JOIN public."order" o ON o.id = sf.order_id
  LEFT JOIN public.fulfillment_item fi ON fi.shop_fulfillment_id = sf.id
 WHERE sf.shop_id = $1
   AND sf.status = ANY($2::text[])
 GROUP BY sf.id, o.order_number, o.placed_at, sf.status, sf.state_changed_at, sf.item_count, o.delivery_type
 -- Oldest first: every package has the same ready-by offset, so this is promise order.
ORDER BY o.placed_at ASC, sf.id ASC
`;

export async function listQueue(
  shopId: string,
  state: QueueState,
  now: Date = new Date(),
): Promise<FulfillmentSummary[]> {
  const statuses = state === "completed" ? COMPLETED_STATUSES : ACTIVE_STATUSES;
  const res = await query<SummaryRow>(LIST_QUEUE, [shopId, statuses]);
  const pickups = await courierPickups(shopId, res.rows.map((r) => r.id));
  return res.rows.map((r) => {
    const promise = { ...promiseFor(r.placed_at), deliveredBy: r.delivered_by, ...pickupOf(pickups, r.id) };
    return {
      id: r.id,
      orderNumber: r.order_number,
      placedAt: r.placed_at,
      status: r.status,
      stateChangedAt: r.state_changed_at,
      itemCount: r.item_count,
      gatheredCount: Number(r.gathered_count ?? 0),
      unavailableCount: Number(r.unavailable_count ?? 0),
      promise,
      atRisk: isAtRisk(promise, r.status, now),
    };
  });
}

/** No payment columns, no order total and no other shop's anything: an order total would leak other shops' lines. */
const READ_DETAIL = `
SELECT sf.id, sf.order_id, o.order_number, o.placed_at, sf.status, sf.state_changed_at, o.delivery_address,
       ${DELIVERED_BY_SQL} AS delivered_by
  FROM public.shop_fulfillment sf
  JOIN public."order" o ON o.id = sf.order_id
 WHERE sf.id = $1 AND sf.shop_id = $2
`;

/** This shop's lines only (`oi.shop_id = sf.shop_id`). */
const READ_ITEMS = `
SELECT oi.id AS order_item_id,
       oi.product_name AS name,
       -- The variant, its stock code and barcode AS SOLD: a picker must never guess the size.
       oi.variant_label,
       oi.variant_code,
       oi.sku,
       oi.gtin,
       pm.storage_key,
       oi.quantity AS ordered_quantity,
       fi.gathered_quantity,
       fi.unavailable_quantity
  FROM public.shop_fulfillment sf
  JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
  LEFT JOIN public.product_variant pv ON pv.id = oi.variant_id
  LEFT JOIN LATERAL (
      SELECT m.storage_key FROM public.product_media m
       WHERE m.product_id = oi.product_id AND (m.id = pv.media_id OR m.is_primary)
       ORDER BY (m.id = pv.media_id) DESC LIMIT 1
  ) pm ON true
  LEFT JOIN public.fulfillment_item fi
         ON fi.shop_fulfillment_id = sf.id AND fi.order_item_id = oi.id
 WHERE sf.id = $1 AND sf.shop_id = $2
 ORDER BY oi.product_name ASC, oi.variant_label ASC NULLS FIRST
`;

/** Opening acknowledges; guarded, so concurrent opens yield one transition. */
const ACKNOWLEDGE = `
UPDATE public.shop_fulfillment
   SET status = 'received', state_changed_at = now(), updated_at = now()
 WHERE id = $1 AND shop_id = $2 AND status = 'pending'
 RETURNING id
`;

function mapDelivery(raw: Record<string, unknown>) {
  const s = (k: string): string => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  const n = (k: string): string | null => (typeof raw[k] === "string" ? (raw[k] as string) : null);
  return {
    recipientName: s("recipientName"),
    phone: n("phone"),
    line1: s("line1"),
    line2: n("line2"),
    city: s("city"),
    region: n("region"),
    postalCode: s("postalCode"),
    country: s("country"),
  };
}

function mapItem(r: ItemRow): FulfillmentItem {
  return {
    orderItemId: r.order_item_id,
    name: r.name,
    variantLabel: r.variant_label,
    variantCode: r.variant_code,
    sku: r.sku,
    gtin: r.gtin,
    imageUrl: r.storage_key,
    orderedQuantity: r.ordered_quantity,
    gatheredQuantity: r.gathered_quantity ?? 0,
    unavailableQuantity: r.unavailable_quantity ?? 0,
  };
}

/** Opening a portion is the acknowledgement, from the pick screen or the order console. Audited only when it happened. */
export async function acknowledge(
  fulfillmentId: string,
  shopId: string,
  actorStaffId: string | null,
): Promise<void> {
  const ack = await query<{ id: string }>(ACKNOWLEDGE, [fulfillmentId, shopId]);
  if ((ack.rowCount ?? 0) > 0) {
    await appendEvent(null, {
      fulfillmentId,
      actorStaffId,
      eventType: "state_changed",
      fromStatus: "pending",
      toStatus: "received",
    });
  }
}

export async function readDetail(
  fulfillmentId: string,
  shopId: string,
  actorStaffId: string | null,
): Promise<FulfillmentDetail> {
  // Acknowledge before reading, so the status reflects it.
  await acknowledge(fulfillmentId, shopId, actorStaffId);

  const head = await query<DetailRow>(READ_DETAIL, [fulfillmentId, shopId]);
  const row = head.rows[0];
  // Missing and another shop's are indistinguishable; the handler answers 403.
  if (!row) throw new FulfillmentError("not_found", "fulfillment not found");

  const [items, pickups] = await Promise.all([query<ItemRow>(READ_ITEMS, [fulfillmentId, shopId]), courierPickups(shopId, [fulfillmentId])]);

  return {
    id: row.id,
    // The shop refund route addresses the order by `order_number`; selected on the detail read only.
    orderId: row.order_id,
    orderNumber: row.order_number,
    placedAt: row.placed_at,
    status: row.status,
    stateChangedAt: row.state_changed_at,
    promise: { ...promiseFor(row.placed_at), deliveredBy: row.delivered_by, ...pickupOf(pickups, fulfillmentId) },
    delivery: mapDelivery(row.delivery_address ?? {}),
    items: items.rows.map(mapItem),
  };
}

/** For the service's legality check before a transition. */
export async function readStatus(
  fulfillmentId: string,
  shopId: string,
): Promise<FulfillmentStatus | null> {
  const res = await query<{ status: FulfillmentStatus }>(
    `SELECT status FROM public.shop_fulfillment WHERE id = $1 AND shop_id = $2`,
    [fulfillmentId, shopId],
  );
  return res.rows[0]?.status ?? null;
}

const APPEND_EVENT = `
INSERT INTO public.fulfillment_event
       (shop_fulfillment_id, actor_staff_id, event_type, from_status, to_status, order_item_id, quantity, detail)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
`;

export interface EventInput {
  fulfillmentId: string;
  actorStaffId: string | null;
  eventType:
    | "state_changed"
    | "item_gathered"
    | "item_unavailable"
    | "item_restored"
    | "note_added"
    | "tags_changed";
  fromStatus?: string | null;
  toStatus?: string | null;
  orderItemId?: string | null;
  quantity?: number | null;
  /** The resulting tag set for `tags_changed`; null otherwise. */
  detail?: string | null;
}

/** Pass a client to write it inside the caller's transaction, which every state change does. */
export async function appendEvent(
  client: { query: (text: string, values: unknown[]) => Promise<unknown> } | null,
  e: EventInput,
): Promise<void> {
  const args = [
    e.fulfillmentId,
    e.actorStaffId,
    e.eventType,
    e.fromStatus ?? null,
    e.toStatus ?? null,
    e.orderItemId ?? null,
    e.quantity ?? null,
    e.detail ?? null,
  ];
  if (client) await client.query(APPEND_EVENT, args);
  else await query(APPEND_EVENT, args);
}

const TRANSITION = `
UPDATE public.shop_fulfillment
   SET status = $4,
       -- ⚠ WRITTEN IN THE SAME STATEMENT AS THE STATUS, so the CHECK constraint sees both at
       -- once. Setting the status first and the reason after would make the intermediate row violate
       -- the unfulfillable-reason CHECK and fail — which is the constraint doing exactly
       -- what it was written for.
       unfulfillable_reason = CASE WHEN $4 = 'unfulfillable' THEN $5 ELSE NULL END,
       state_changed_at = now(), updated_at = now()
 WHERE id = $1 AND shop_id = $2 AND status = $3
 RETURNING id
`;

/** On entry to picking. On conflict do nothing keeps progress across a reversal. */
const SEED_ITEMS = `
INSERT INTO public.fulfillment_item (shop_fulfillment_id, order_item_id, ordered_quantity)
SELECT sf.id, oi.id, oi.quantity
  FROM public.shop_fulfillment sf
  JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
 WHERE sf.id = $1 AND sf.shop_id = $2
ON CONFLICT (shop_fulfillment_id, order_item_id) DO NOTHING
`;

/** false when zero rows matched; the service decides no-op versus conflict. */
export async function transition(
  fulfillmentId: string,
  shopId: string,
  from: FulfillmentStatus,
  to: FulfillmentStatus,
  actorStaffId: string | null,
  /** Required by the database when `to` is `unfulfillable`. */
  reason?: string,
): Promise<boolean> {
  return withTransaction(async (client) => {
    // The ready gate: every live bag printed (and pack-scanned where required), under the package's lock.
    // A refusal is named (`labels_not_printed`, `bags_not_packed`, `zone_bag_required`).
    if (to === "ready_for_pickup") {
      const locked = await client.query(`SELECT 1 FROM public.shop_fulfillment WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [fulfillmentId, shopId]);
      if ((locked.rowCount ?? 0) > 0) await assertReadyForPickup(client, fulfillmentId);
    }
    const res = await client.query<{ id: string }>(TRANSITION, [
      fulfillmentId, shopId, from, to, reason ?? null,
    ]);
    if ((res.rowCount ?? 0) === 0) return false;

    if (to === "picking") await client.query(SEED_ITEMS, [fulfillmentId, shopId]);

    await appendEvent(client, {
      fulfillmentId,
      actorStaffId,
      eventType: "state_changed",
      fromStatus: from,
      toStatus: to,
    });

    // Push intent in the same transaction, deduped on the fulfilment id; order id and deep link only.
    if (to === "ready_for_pickup") {
      await client.query(
        `INSERT INTO public.notification_request (recipient_sub, audience, type, payload, dedupe_key)
         SELECT c.cognito_sub, 'customer', 'order_ready',
                jsonb_build_object('entityId', o.id::text, 'deepLink', 'effy://order/' || o.id::text),
                'order_ready:' || c.cognito_sub || ':' || sf.id::text
           FROM public.shop_fulfillment sf
           JOIN public."order" o ON o.id = sf.order_id
           JOIN public.customer c ON c.id = o.customer_id
          WHERE sf.id = $1
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [fulfillmentId],
      );
    }
    return true;
  });
}

/**
 * A pick shortfall sets the variant's count to zero (payment already deducted the order, so never
 * subtract), in the same transaction as the pick and only when not already zero. `actor_sub` is the
 * staff member's Cognito sub (null if the record is gone). Untracked variants are untouched.
 */
export async function emptyShelfFromPick(
  client: { query: (text: string, values: unknown[]) => Promise<unknown> },
  orderItemId: string,
  actorStaffId: string | null,
): Promise<void> {
  await client.query(
    // The variant that was sold, not its siblings.
    `WITH prev AS (
       SELECT v.id, v.product_id, v.shop_id, v.stock_on_hand
         FROM public.product_variant v
         JOIN public.order_item oi ON oi.variant_id = v.id
        WHERE oi.id = $1 AND v.stock_tracked AND v.stock_on_hand <> 0
        FOR UPDATE OF v
     ), moved AS (
       UPDATE public.product_variant v
          SET stock_on_hand = 0
         FROM prev
        WHERE v.id = prev.id
       RETURNING v.id, prev.product_id, prev.shop_id, prev.stock_on_hand AS before, v.stock_on_hand AS after
     )
     INSERT INTO public.stock_movement
         (product_id, variant_id, shop_id, quantity_delta, quantity_before, quantity_after, reason, actor_kind, actor_sub)
     SELECT product_id, id, shop_id, after - before, before, after, 'pick_shortfall', 'shop',
            (SELECT ss.cognito_sub FROM public.shop_staff ss WHERE ss.id = $2)
       FROM moved`,
    [orderItemId, actorStaffId],
  );
}
