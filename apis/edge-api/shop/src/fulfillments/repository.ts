// Repository for shop order fulfilment (020): raw parameterized SQL, no ORM, no query builder.
//
// EVERY statement here is bound to `shopId` — the value gate() resolved from the operator's own
// shop_staff record, never anything a client sent. That is what makes cross-shop access structurally
// impossible rather than merely checked (FR-019, SC-007, research R11).
//
// Transitions use a GUARDED CONDITIONAL UPDATE — `WHERE id=$1 AND shop_id=$2 AND status=$expected` —
// the same idiom 019's payment finalizer proved. Zero rows affected means someone else already
// applied it, which the service turns into a benign no-op rather than an error (FR-014, SC-005).
// This is single-statement atomic: no advisory locks, no SELECT ... FOR UPDATE, no extra round trip.

import { query, withTransaction } from "@effy/edge-shared";
import type pg from "pg";

import { promiseFrom, isAtRisk } from "./promise";
import {
  ACTIVE_STATUSES,
  COMPLETED_STATUSES,
  FulfillmentError,
  type FulfillmentDetail,
  type FulfillmentItem,
  type FulfillmentStatus,
  type FulfillmentSummary,
  type ItemProgress,
  type QueueState,
} from "./types";

// ── Row shapes (never escape this module) ──────────────────────────────────────────────────────

interface SummaryRow {
  promised_ready_at: Date | null;
  delivery_service_level: string | null;
  id: string;
  order_number: string;
  placed_at: Date;
  status: FulfillmentStatus;
  state_changed_at: Date;
  item_count: number;
  gathered_count: string | null;
  unavailable_count: string | null;
}

interface DetailRow {
  promised_ready_at: Date | null;
  delivery_service_level: string | null;
  id: string;
  order_number: string;
  placed_at: Date;
  status: FulfillmentStatus;
  state_changed_at: Date;
  delivery_address: Record<string, unknown>;
}

interface ItemRow {
  order_item_id: string;
  name: string;
  sku: string | null;
  storage_key: string | null;
  ordered_quantity: number;
  gathered_quantity: number | null;
  unavailable_quantity: number | null;
}

// ── Queue (US1) ────────────────────────────────────────────────────────────────────────────────

/**
 * The queue read.
 *
 * ORDER BY is THE 021 SEAM (research R7): while every order carries the same promise, `readyBy` is a
 * constant offset from `placed_at`, so ordering by promise IS ordering by arrival — strict FIFO,
 * SC-020, by construction. 021 replaces this expression with its real promised-ready column and
 * nothing else in the query changes. `sf.id` is the stable tiebreaker so the ordering is TOTAL:
 * two orders placed in the same millisecond must not swap position between polls (SC-018).
 *
 * The progress counts are a LEFT JOIN aggregate because fulfillment_item rows do not exist until
 * picking begins — a pending portion must still report 0/0 rather than dropping out of the queue.
 */
const LIST_QUEUE = `
SELECT sf.id,
       o.order_number,
       o.placed_at,
       sf.promised_ready_at,
       sf.delivery_service_level,
       sf.status,
       sf.state_changed_at,
       sf.item_count,
       COALESCE(SUM(fi.gathered_quantity), 0)    AS gathered_count,
       COALESCE(SUM(fi.unavailable_quantity), 0) AS unavailable_count
  FROM public.shop_fulfillment sf
  JOIN public."order" o ON o.id = sf.order_id
  LEFT JOIN public.fulfillment_item fi ON fi.shop_fulfillment_id = sf.id
 WHERE sf.shop_id = $1
   AND sf.status = ANY($2::text[])
 GROUP BY sf.id, o.order_number, o.placed_at, sf.promised_ready_at, sf.delivery_service_level, sf.status, sf.state_changed_at, sf.item_count
 ORDER BY COALESCE(sf.promised_ready_at, o.placed_at) ASC, sf.id ASC
`;

export async function listQueue(
  shopId: string,
  state: QueueState,
  now: Date = new Date(),
): Promise<FulfillmentSummary[]> {
  const statuses = state === "completed" ? COMPLETED_STATUSES : ACTIVE_STATUSES;
  const res = await query<SummaryRow>(LIST_QUEUE, [shopId, statuses]);
  return res.rows.map((r) => {
    const promise = promiseFrom(r.placed_at, r.promised_ready_at, r.delivery_service_level);
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

// ── Detail (US2) ───────────────────────────────────────────────────────────────────────────────

/**
 * The portion header.
 *
 * Note what is NOT selected: no payment columns, no order grand total, no item_subtotal, no
 * delivery fee, and no other shop's anything. A shop sees the delivery snapshot and its own lines
 * (FR-007, FR-008). An order-level total would itself leak the existence of other shops' items.
 */
const READ_DETAIL = `
SELECT sf.id, o.order_number, o.placed_at, sf.promised_ready_at, sf.delivery_service_level, sf.status, sf.state_changed_at, o.delivery_address
  FROM public.shop_fulfillment sf
  JOIN public."order" o ON o.id = sf.order_id
 WHERE sf.id = $1 AND sf.shop_id = $2
`;

/**
 * This shop's lines only.
 *
 * `oi.shop_id = sf.shop_id` is the load-bearing predicate: order_item.shop_id was denormalized at
 * placement by 019 precisely so a shop's slice of a multi-shop order is a direct query with no
 * ambiguity. Without it, opening a two-shop order would show the whole order.
 */
const READ_ITEMS = `
SELECT oi.id AS order_item_id,
       oi.product_name AS name,
       p.sku,
       pm.storage_key,
       oi.quantity AS ordered_quantity,
       fi.gathered_quantity,
       fi.unavailable_quantity
  FROM public.shop_fulfillment sf
  JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
  LEFT JOIN public.product p ON p.id = oi.product_id
  LEFT JOIN public.product_media pm ON pm.product_id = oi.product_id AND pm.is_primary
  LEFT JOIN public.fulfillment_item fi
         ON fi.shop_fulfillment_id = sf.id AND fi.order_item_id = oi.id
 WHERE sf.id = $1 AND sf.shop_id = $2
 ORDER BY oi.product_name ASC
`;

/** Implicit acknowledge on first open (FR-011a). Guarded, so concurrent opens yield one transition. */
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
    sku: r.sku,
    imageUrl: r.storage_key,
    orderedQuantity: r.ordered_quantity,
    gatheredQuantity: r.gathered_quantity ?? 0,
    unavailableQuantity: r.unavailable_quantity ?? 0,
  };
}

export async function readDetail(
  fulfillmentId: string,
  shopId: string,
  actorStaffId: string | null,
): Promise<FulfillmentDetail> {
  // Acknowledge BEFORE reading, so the returned status reflects the acknowledgement the caller just
  // caused. The audit row is written only when the transition actually happened (rowCount > 0).
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

  const head = await query<DetailRow>(READ_DETAIL, [fulfillmentId, shopId]);
  const row = head.rows[0];
  // Not found and belongs-to-another-shop are indistinguishable here BY DESIGN — the handler turns
  // this into 403, so response codes cannot be used to enumerate other shops' portions.
  if (!row) throw new FulfillmentError("not_found", "fulfillment not found");

  const items = await query<ItemRow>(READ_ITEMS, [fulfillmentId, shopId]);

  return {
    id: row.id,
    orderNumber: row.order_number,
    placedAt: row.placed_at,
    status: row.status,
    stateChangedAt: row.state_changed_at,
    promise: promiseFrom(row.placed_at, row.promised_ready_at, row.delivery_service_level),
    delivery: mapDelivery(row.delivery_address ?? {}),
    items: items.rows.map(mapItem),
  };
}

/** Current status only — the service reads this to decide legality before attempting a transition. */
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

// ── Audit (FR-015, FR-019b) ────────────────────────────────────────────────────────────────────

const APPEND_EVENT = `
INSERT INTO public.fulfillment_event
       (shop_fulfillment_id, actor_staff_id, event_type, from_status, to_status, order_item_id, quantity)
VALUES ($1, $2, $3, $4, $5, $6, $7)
`;

interface EventInput {
  fulfillmentId: string;
  actorStaffId: string | null;
  eventType: "state_changed" | "item_gathered" | "item_unavailable" | "item_restored";
  fromStatus?: string | null;
  toStatus?: string | null;
  orderItemId?: string | null;
  quantity?: number | null;
}

/**
 * Append one audit row. Pass a client to write it INSIDE the caller's transaction — which every
 * state change does, so the audit can never disagree with the state it records (research R6).
 */
async function appendEvent(client: pg.PoolClient | null, e: EventInput): Promise<void> {
  const args = [
    e.fulfillmentId,
    e.actorStaffId,
    e.eventType,
    e.fromStatus ?? null,
    e.toStatus ?? null,
    e.orderItemId ?? null,
    e.quantity ?? null,
  ];
  if (client) await client.query(APPEND_EVENT, args);
  else await query(APPEND_EVENT, args);
}

// ── Transitions (US3) ──────────────────────────────────────────────────────────────────────────

const TRANSITION = `
UPDATE public.shop_fulfillment
   SET status = $4, state_changed_at = now(), updated_at = now()
 WHERE id = $1 AND shop_id = $2 AND status = $3
 RETURNING id
`;

/**
 * Seed one progress row per line on entry to picking.
 *
 * ON CONFLICT DO NOTHING makes re-entry after a reversal idempotent — a portion that goes
 * ready_for_pickup -> picking must NOT lose the progress already recorded (FR-011d).
 */
const SEED_ITEMS = `
INSERT INTO public.fulfillment_item (shop_fulfillment_id, order_item_id, ordered_quantity)
SELECT sf.id, oi.id, oi.quantity
  FROM public.shop_fulfillment sf
  JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
 WHERE sf.id = $1 AND sf.shop_id = $2
ON CONFLICT (shop_fulfillment_id, order_item_id) DO NOTHING
`;

/**
 * Apply a guarded transition. Returns false when zero rows matched — the service decides whether
 * that is a benign no-op (already in the target state) or a conflict (in some other state).
 */
export async function transition(
  fulfillmentId: string,
  shopId: string,
  from: FulfillmentStatus,
  to: FulfillmentStatus,
  actorStaffId: string | null,
): Promise<boolean> {
  return withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(TRANSITION, [fulfillmentId, shopId, from, to]);
    if ((res.rowCount ?? 0) === 0) return false;

    if (to === "picking") await client.query(SEED_ITEMS, [fulfillmentId, shopId]);

    await appendEvent(client, {
      fulfillmentId,
      actorStaffId,
      eventType: "state_changed",
      fromStatus: from,
      toStatus: to,
    });
    return true;
  });
}

// ── The pickup stub (US3a) — ⚠ DEV-ONLY SCAFFOLD, FR-030…FR-034 ────────────────────────────────

/**
 * Mark a ready portion collected by a PLACEHOLDER driver.
 *
 * The driver reference is stored in the audit trail prefixed `placeholder:` and never in a column
 * that a future driver system would read as real dispatch data (FR-033, SC-014). There is
 * deliberately no `driver_id` column anywhere in this slice — inventing one would be modelling the
 * delivery execution this product does not expose (FR-002a, SC-021).
 *
 * Deleted when the driver slice ships a real dispatch path (FR-034). Do not extend it.
 */
export async function collectViaStub(
  fulfillmentId: string,
  shopId: string,
  driverRef: string,
  actorStaffId: string | null,
): Promise<boolean> {
  return withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(TRANSITION, [
      fulfillmentId,
      shopId,
      "ready_for_pickup",
      "collected",
    ]);
    if ((res.rowCount ?? 0) === 0) return false;

    await appendEvent(client, {
      fulfillmentId,
      actorStaffId,
      eventType: "state_changed",
      fromStatus: "ready_for_pickup",
      toStatus: `collected:placeholder:${driverRef}`,
    });
    return true;
  });
}

// ── Item progress (US2) ────────────────────────────────────────────────────────────────────────

/**
 * Record absolute picked/unavailable quantities for one line.
 *
 * Scoped through shop_fulfillment so a caller cannot patch a line on another shop's portion even
 * with a valid order_item_id. COALESCE leaves an omitted field untouched, so the two quantities can
 * be updated independently. The DB CHECK (gathered + unavailable <= ordered) is the backstop behind
 * the service's validation.
 */
const UPDATE_ITEM = `
UPDATE public.fulfillment_item fi
   SET gathered_quantity    = COALESCE($3, fi.gathered_quantity),
       unavailable_quantity = COALESCE($4, fi.unavailable_quantity),
       updated_at           = now()
  FROM public.shop_fulfillment sf
 WHERE fi.shop_fulfillment_id = sf.id
   AND sf.id = $1 AND sf.shop_id = $2
   AND fi.order_item_id = $5
 RETURNING fi.id, fi.gathered_quantity, fi.unavailable_quantity, fi.ordered_quantity
`;

export async function updateItemProgress(
  fulfillmentId: string,
  shopId: string,
  orderItemId: string,
  progress: ItemProgress,
  actorStaffId: string | null,
): Promise<void> {
  await withTransaction(async (client) => {
    let res;
    try {
      res = await client.query<{
        id: string;
        gathered_quantity: number;
        unavailable_quantity: number;
        ordered_quantity: number;
      }>(UPDATE_ITEM, [
        fulfillmentId,
        shopId,
        progress.gatheredQuantity ?? null,
        progress.unavailableQuantity ?? null,
        orderItemId,
      ]);
    } catch (err) {
      // 23514 check_violation — the accounting CHECK. Surfaces as a validation error, not a 500.
      if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23514") {
        throw new FulfillmentError("validation", "quantities exceed the quantity ordered", [
          { field: "gatheredQuantity", message: "gathered + unavailable cannot exceed ordered" },
        ]);
      }
      throw err;
    }

    const row = res.rows[0];
    if (!row) throw new FulfillmentError("not_found", "line not found on this fulfillment");

    if (progress.gatheredQuantity !== undefined) {
      await appendEvent(client, {
        fulfillmentId,
        actorStaffId,
        eventType: "item_gathered",
        orderItemId,
        quantity: progress.gatheredQuantity,
      });
    }
    if (progress.unavailableQuantity !== undefined) {
      // Distinguish flagging from un-flagging so the audit shows an item that turned up (FR-010d).
      await appendEvent(client, {
        fulfillmentId,
        actorStaffId,
        eventType: progress.unavailableQuantity > 0 ? "item_unavailable" : "item_restored",
        orderItemId,
        quantity: progress.unavailableQuantity,
      });
    }
  });
}
