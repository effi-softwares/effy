// Repository for the shop ORDER CONSOLE (057 Amendment A3): raw parameterized SQL, no ORM.
//
// ⚠ EVERY STATEMENT IS BOUND TO `shopId` — the value gate() resolved from the operator's own
// shop_staff record, never client input — exactly as `fulfillments/repository.ts` is. The portion
// (`shop_fulfillment`) is the only way in: tags, notes and events hang off it, and the order's money
// is reached THROUGH it, so a caller can only ever see an order their shop is fulfilling part of.
//
// ⚠ NOTHING CLIENT-SUPPLIED IS EVER SPLICED INTO SQL TEXT. The sort column and direction are looked up
// in a fixed map below; every value is a bind parameter.

import { presignRead, query, withTransaction } from "@effy/edge-shared";

import { appendEvent } from "../fulfillments/repository";
import {
  AT_RISK_THRESHOLD_MS,
  DEFAULT_READY_WINDOW_MS,
} from "../fulfillments/promise";
import { FulfillmentError, type FulfillmentStatus } from "../fulfillments/types";
import type {
  OrderDetail,
  OrderLine,
  OrderList,
  OrderListQuery,
  OrderNote,
  OrderRefund,
  OrderRow,
  OrderTab,
  PaymentState,
} from "./types";
import { ORDER_TABS } from "./types";

// ── Shared SQL fragments — ONE definition each, used by the list and the detail ────────────────

/**
 * When the order was placed. `placed_at` is set by the paid transition; `created_at` covers any row
 * that predates it, so no portion drops out of a date filter for want of a timestamp.
 */
const PLACED = `COALESCE(o.placed_at, o.created_at)`;

/**
 * At risk against its promise (020 FR-001a), in SQL so the "Status" filter and the badge agree.
 *
 * ⚠ THE INTERVALS ARE DERIVED FROM `promise.ts`, not retyped. That file is the one place the promise
 * is decided (020 research R7); a second "1 hour" here would be free to drift from it.
 */
const AT_RISK = `(sf.status IN ('pending', 'received', 'picking')
  AND ${PLACED} + interval '${DEFAULT_READY_WINDOW_MS / 1000} seconds'
      <= now() + interval '${AT_RISK_THRESHOLD_MS / 1000} seconds')`;

/**
 * Where the money stands, DERIVED from the refund rows (027's counted-not-stored rule).
 *
 * ⚠ ONE EXPRESSION FOR BOTH READS. The list filters on it and the detail badges with it; two
 * implementations would let the Payment filter return a row whose own badge disagrees.
 * ⚠ `refund_pending` sits BELOW `refunded`: a fully-returned order with a stray pending attempt is
 * still fully returned. And "submitted" is never "returned" (055) — it counts as pending, not refunded.
 */
function paymentStateSql(total: string, refunded: string, pending: string): string {
  return `CASE
    WHEN ${total} > 0 AND ${refunded} >= ${total} THEN 'refunded'
    WHEN ${pending} > 0 THEN 'refund_pending'
    WHEN ${refunded} > 0 THEN 'partially_refunded'
    ELSE 'paid'
  END`;
}

/** Refund totals for one order, split by whether the money has actually gone back. */
const REFUND_TOTALS = `
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'succeeded'), 0)                  AS settled,
           COALESCE(SUM(r.amount) FILTER (WHERE r.status IN ('submitting', 'submitted')), 0) AS pending
      FROM public.refund r
     WHERE r.order_id = o.id
  ) rf ON true`;

// ── The list ────────────────────────────────────────────────────────────────────────────────────

/**
 * Every portion this shop holds, with everything a row or a filter needs, computed once.
 *
 * `$1` shop · `$2` search pattern (NULL = none) · `$3` attention · `$4` payment · `$5` method ·
 * `$6` range. The tab is deliberately NOT a predicate here: the per-tab counts are taken over this
 * set, which is what makes each count answer "how many would I see if I clicked it" under whatever
 * else is applied.
 */
const FILTERED = `
WITH base AS (
  SELECT sf.id,
         o.order_number,
         ${PLACED} AS placed_at,
         sf.status,
         sf.item_count,
         COALESCE(fi.gathered, 0)::int    AS gathered_count,
         COALESCE(fi.unavailable, 0)::int AS unavailable_count,
         sf.delivery_method,
         COALESCE(o.delivery_address ->> 'recipientName', '') AS customer_name,
         o.grand_total_amount AS total,
         o.currency,
         ${paymentStateSql("o.grand_total_amount", "rf.settled", "rf.pending")} AS payment,
         ${AT_RISK} AS at_risk,
         COALESCE(tg.tags, ARRAY[]::text[]) AS tags,
         CASE WHEN sf.status IN ('pending', 'received') THEN 'new' ELSE sf.status END AS tab
    FROM public.shop_fulfillment sf
    JOIN public."order" o ON o.id = sf.order_id
    LEFT JOIN LATERAL (
      SELECT SUM(x.gathered_quantity) AS gathered, SUM(x.unavailable_quantity) AS unavailable
        FROM public.fulfillment_item x
       WHERE x.shop_fulfillment_id = sf.id
    ) fi ON true
    ${REFUND_TOTALS}
    LEFT JOIN LATERAL (
      SELECT array_agg(t.tag ORDER BY t.tag) AS tags
        FROM public.fulfillment_tag t
       WHERE t.shop_fulfillment_id = sf.id
    ) tg ON true
   WHERE sf.shop_id = $1
), filtered AS (
  SELECT *
    FROM base
   WHERE ($2::text IS NULL OR order_number ILIKE $2 OR customer_name ILIKE $2)
     AND (   $3::text = 'any'
          OR ($3::text = 'at_risk'  AND at_risk)
          OR ($3::text = 'short'    AND unavailable_count > 0)
          OR ($3::text = 'on_track' AND NOT at_risk AND unavailable_count = 0))
     AND ($4::text = 'any' OR payment = $4)
     AND ($5::text = 'any' OR delivery_method = $5)
     AND (   $6::text = 'any'
          -- ⚠ "Today" is the Melbourne day (047's timezone rule), not the server's UTC day — a 9am
          -- order in Melbourne is still "yesterday" in UTC.
          OR ($6::text = 'today' AND placed_at >= (date_trunc('day', now() AT TIME ZONE 'Australia/Melbourne')
                                             AT TIME ZONE 'Australia/Melbourne'))
          OR ($6::text = '7d'  AND placed_at >= now() - interval '7 days')
          OR ($6::text = '30d' AND placed_at >= now() - interval '30 days'))
)`;

/**
 * The sort columns. ⚠ A FIXED MAP, never the client's string — the only way a user-chosen ORDER BY
 * stays out of the SQL text. Every entry ends in `id` so the order is TOTAL: two rows with the same
 * placed time must not swap between page loads (020 SC-018's reasoning, carried over).
 */
const ORDER_BY: Record<OrderListQuery["sort"], string> = {
  placed: "placed_at",
  number: "order_number",
  customer: "lower(customer_name)",
  items: "item_count",
  total: "total",
};

interface RowRecord {
  id: string;
  order_number: string;
  placed_at: Date;
  status: FulfillmentStatus;
  item_count: number;
  gathered_count: number;
  unavailable_count: number;
  delivery_method: "same_day" | "standard" | null;
  customer_name: string;
  total: string;
  currency: string;
  payment: PaymentState;
  at_risk: boolean;
  tags: string[];
  full_count: string;
}

/** Escape LIKE metacharacters so a search for "50%" means the characters, not "starts with 50". */
function likePattern(q: string): string | null {
  const trimmed = q.trim();
  if (!trimmed) return null;
  return `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function listOrders(shopId: string, q: OrderListQuery): Promise<OrderList> {
  const filterArgs = [shopId, likePattern(q.q), q.attention, q.payment, q.method, q.range];
  const direction = q.dir === "asc" ? "ASC" : "DESC";
  const offset = (q.page - 1) * q.pageSize;

  const [page, counts] = await Promise.all([
    query<RowRecord>(
      `${FILTERED}
       SELECT *, count(*) OVER () AS full_count
         FROM filtered
        WHERE ($7::text = 'all' OR tab = $7::text)
        ORDER BY ${ORDER_BY[q.sort]} ${direction}, id ${direction}
        LIMIT $8 OFFSET $9`,
      [...filterArgs, q.tab, q.pageSize, offset],
    ),
    query<{ tab: OrderTab; n: string }>(
      `${FILTERED}
       SELECT tab, count(*) AS n FROM filtered GROUP BY tab`,
      filterArgs,
    ),
  ]);

  const byTab = Object.fromEntries(ORDER_TABS.map((t) => [t, 0])) as Record<OrderTab, number>;
  for (const r of counts.rows) {
    if (r.tab in byTab) byTab[r.tab] = Number(r.n);
    byTab.all += Number(r.n);
  }

  return {
    items: page.rows.map(toRow),
    // ⚠ Past the last page the window function has no rows to ride on, so the total falls back to the
    // tab's count rather than claiming zero matches exist.
    total: page.rows[0] ? Number(page.rows[0].full_count) : byTab[q.tab],
    page: q.page,
    pageSize: q.pageSize,
    counts: byTab,
  };
}

function toRow(r: RowRecord): OrderRow {
  return {
    id: r.id,
    orderNumber: r.order_number,
    customerName: r.customer_name,
    placedAt: r.placed_at,
    status: r.status,
    itemCount: r.item_count,
    gatheredCount: r.gathered_count,
    unavailableCount: r.unavailable_count,
    deliveryMethod: r.delivery_method,
    atRisk: r.at_risk,
    payment: r.payment,
    total: money(r.total),
    currency: r.currency,
    tags: r.tags,
  };
}

// ── The detail ──────────────────────────────────────────────────────────────────────────────────

interface HeadRecord {
  id: string;
  order_id: string;
  order_number: string;
  placed_at: Date;
  paid_at: Date | null;
  status: FulfillmentStatus;
  state_changed_at: Date;
  delivery_method: "same_day" | "standard" | null;
  unfulfillable_reason: string | null;
  delivery_address: Record<string, unknown> | null;
  item_subtotal_amount: string;
  delivery_fee_amount: string;
  discount_amount: string;
  promo_code: string | null;
  grand_total_amount: string;
  currency: string;
  payment_amount: string | null;
  method_type: string | null;
  method_brand: string | null;
  method_last4: string | null;
  refunded: string;
  refund_pending: string;
  payment: PaymentState;
  at_risk: boolean;
  collected_at: Date | null;
  delivered_at: Date | null;
}

/**
 * The portion and its order's money.
 *
 * ⚠ The delivery snapshot is the ONLY address selected. The order carries a second, payment-side
 * address that 023 FR-018 keeps from every shop surface; this query never names it, and the guard in
 * the 023 address guard in `fulfillments/` reads this file to prove it.
 */
const READ_HEAD = `
SELECT sf.id, sf.order_id, o.order_number,
       ${PLACED} AS placed_at, o.placed_at AS paid_at,
       sf.status, sf.state_changed_at, sf.delivery_method, sf.unfulfillable_reason,
       o.delivery_address,
       o.item_subtotal_amount, o.delivery_fee_amount, o.discount_amount, o.promo_code,
       o.grand_total_amount, o.currency,
       p.amount AS payment_amount, p.method_type, p.method_brand, p.method_last4,
       rf.settled AS refunded, rf.pending AS refund_pending,
       ${paymentStateSql("o.grand_total_amount", "rf.settled", "rf.pending")} AS payment,
       ${AT_RISK} AS at_risk,
       (SELECT ct.collected_at FROM public.collection_task ct WHERE ct.shop_fulfillment_id = sf.id) AS collected_at,
       (SELECT pa.arrived_at   FROM public.package_arrival pa WHERE pa.shop_fulfillment_id = sf.id) AS delivered_at
  FROM public.shop_fulfillment sf
  JOIN public."order" o ON o.id = sf.order_id
  LEFT JOIN public.payment p ON p.order_id = o.id
  ${REFUND_TOTALS}
 WHERE sf.id = $1 AND sf.shop_id = $2
`;

interface LineRecord {
  order_item_id: string;
  name: string;
  sku: string | null;
  storage_key: string | null;
  ordered_quantity: number;
  gathered_quantity: number | null;
  unavailable_quantity: number | null;
  refunded_quantity: string | null;
  unit_price_amount: string;
  line_subtotal_amount: string;
}

/**
 * This shop's lines, priced from the receipt snapshot.
 *
 * `oi.shop_id = sf.shop_id` is the load-bearing predicate, as in the pick read: without it a two-shop
 * order would show the whole order's lines. `refunded_quantity` counts every refund that is not
 * `failed`/`refused` — pending ones included, because offering to refund a unit that is already on its
 * way back is how a line gets refunded twice (055's ceiling counts them the same way).
 */
const READ_LINES = `
SELECT oi.id AS order_item_id,
       oi.product_name AS name,
       p.sku,
       pm.storage_key,
       oi.quantity AS ordered_quantity,
       fi.gathered_quantity,
       fi.unavailable_quantity,
       (SELECT SUM(rl.quantity)
          FROM public.refund_line rl
          JOIN public.refund r ON r.id = rl.refund_id
         WHERE rl.order_item_id = oi.id
           AND r.status NOT IN ('failed', 'refused')) AS refunded_quantity,
       oi.unit_price_amount,
       oi.line_subtotal_amount
  FROM public.shop_fulfillment sf
  JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
  LEFT JOIN public.product p ON p.id = oi.product_id
  LEFT JOIN public.product_media pm ON pm.product_id = oi.product_id AND pm.is_primary
  LEFT JOIN public.fulfillment_item fi
         ON fi.shop_fulfillment_id = sf.id AND fi.order_item_id = oi.id
 WHERE sf.id = $1 AND sf.shop_id = $2
 ORDER BY oi.product_name ASC, oi.id ASC
`;

interface RefundRecord {
  id: string;
  amount: string;
  status: OrderRefund["status"];
  reason: OrderRefund["reason"];
  actor_kind: OrderRefund["actorKind"];
  shop_actor_name: string | null;
  created_at: Date;
}

/**
 * Every refund on the order, any issuer — a shop should see money Effy returned for its lines too.
 *
 * ⚠ ONLY A SHOP ACTOR IS NAMED. A back-office refund reads "Effy", never the staff member: an
 * internal employee's name is not the shop's business, and the label resolves the same way whoever
 * at Effy did it. Hence the join is to `public.shop_staff` alone, and only for `actor_kind = 'shop'`.
 */
const READ_REFUNDS = `
SELECT r.id, r.amount::text AS amount, r.status, r.reason, r.actor_kind,
       ss.name AS shop_actor_name, r.created_at
  FROM public.shop_fulfillment sf
  JOIN public.refund r ON r.order_id = sf.order_id
  LEFT JOIN public.shop_staff ss ON ss.cognito_sub = r.actor_sub AND r.actor_kind = 'shop'
 WHERE sf.id = $1 AND sf.shop_id = $2
 ORDER BY r.created_at DESC, r.id DESC
`;

const READ_TAGS = `
SELECT t.tag
  FROM public.fulfillment_tag t
  JOIN public.shop_fulfillment sf ON sf.id = t.shop_fulfillment_id
 WHERE sf.id = $1 AND sf.shop_id = $2
 ORDER BY t.tag
`;

const READ_NOTES = `
SELECT n.id, n.body, ss.name AS author_name, n.created_at
  FROM public.fulfillment_note n
  JOIN public.shop_fulfillment sf ON sf.id = n.shop_fulfillment_id
  LEFT JOIN public.shop_staff ss ON ss.id = n.author_staff_id
 WHERE sf.id = $1 AND sf.shop_id = $2
 ORDER BY n.created_at DESC, n.id DESC
`;

export async function readOrder(fulfillmentId: string, shopId: string): Promise<OrderDetail> {
  const head = await query<HeadRecord>(READ_HEAD, [fulfillmentId, shopId]);
  const row = head.rows[0];
  // Missing and another shop's are indistinguishable BY DESIGN — the handler answers 403 for both.
  if (!row) throw new FulfillmentError("not_found", "order not found");

  const args = [fulfillmentId, shopId];
  const [lines, refunds, tags, notes] = await Promise.all([
    query<LineRecord>(READ_LINES, args),
    query<RefundRecord>(READ_REFUNDS, args),
    query<{ tag: string }>(READ_TAGS, args),
    query<{ id: string; body: string; author_name: string | null; created_at: Date }>(READ_NOTES, args),
  ]);

  const mappedLines = await Promise.all(lines.rows.map(toLine));
  const shopSubtotal = lines.rows.reduce((c, l) => c + cents(l.line_subtotal_amount), 0);
  const total = cents(row.grand_total_amount);
  const refunded = cents(row.refunded);

  return {
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    placedAt: row.placed_at,
    status: row.status,
    stateChangedAt: row.state_changed_at,
    readyBy: new Date(row.placed_at.getTime() + DEFAULT_READY_WINDOW_MS),
    deliveryMethod: row.delivery_method,
    atRisk: row.at_risk,
    delivery: mapDelivery(row.delivery_address ?? {}),
    lines: mappedLines,
    money: {
      currency: row.currency,
      shopSubtotal: fromCents(shopSubtotal),
      itemSubtotal: money(row.item_subtotal_amount),
      deliveryFee: money(row.delivery_fee_amount),
      discount: money(row.discount_amount),
      promoCode: row.promo_code,
      total: money(row.grand_total_amount),
      refunded: money(row.refunded),
      refundPending: money(row.refund_pending),
      net: fromCents(Math.max(0, total - refunded)),
    },
    payment: {
      state: row.payment,
      methodType: row.method_type,
      methodBrand: row.method_brand,
      methodLast4: row.method_last4,
      amount: money(row.payment_amount ?? row.grand_total_amount),
      paidAt: row.paid_at,
    },
    refunds: refunds.rows.map(
      (r): OrderRefund => ({
        id: r.id,
        amount: money(r.amount),
        status: r.status,
        reason: r.reason,
        actorKind: r.actor_kind,
        actorLabel: actorLabel(r.actor_kind, r.shop_actor_name),
        createdAt: r.created_at,
      }),
    ),
    handoff: {
      collectedAt: row.collected_at,
      deliveredAt: row.delivered_at,
      unfulfillableReason: row.unfulfillable_reason,
    },
    tags: tags.rows.map((t) => t.tag),
    notes: notes.rows.map(
      (n): OrderNote => ({
        id: n.id,
        body: n.body,
        authorLabel: n.author_name,
        createdAt: n.created_at,
      }),
    ),
  };
}

async function toLine(r: LineRecord): Promise<OrderLine> {
  return {
    orderItemId: r.order_item_id,
    name: r.name,
    sku: r.sku,
    // ⚠ PRESIGNED, not the raw storage key. The pick DTO hands the key through as `imageUrl`, which
    // no browser can load; the console renders a thumbnail, so it gets a URL that works.
    imageUrl: r.storage_key ? await presignRead(r.storage_key) : null,
    orderedQuantity: r.ordered_quantity,
    gatheredQuantity: r.gathered_quantity ?? 0,
    unavailableQuantity: r.unavailable_quantity ?? 0,
    refundedQuantity: Number(r.refunded_quantity ?? 0),
    unitPrice: money(r.unit_price_amount),
    lineTotal: money(r.line_subtotal_amount),
  };
}

/** The shop's view of who issued a refund. See READ_REFUNDS for why back-office is not named. */
export function actorLabel(kind: OrderRefund["actorKind"], shopName: string | null): string | null {
  switch (kind) {
    case "shop":
      return shopName;
    case "back_office":
      return "Effy";
    case "customer":
      return "Customer";
    case "system":
      return "Payment provider";
  }
}

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

// ── The activity log ────────────────────────────────────────────────────────────────────────────

export interface ActivityRecord {
  source: "event" | "refund" | "collection" | "arrival";
  id: string;
  at: Date;
  event_type: string | null;
  from_status: string | null;
  to_status: string | null;
  quantity: number | null;
  detail: string | null;
  item_name: string | null;
  amount: string | null;
  refund_status: string | null;
  refund_kind: string | null;
  actor_kind: string | null;
  actor_name: string | null;
}

/**
 * The portion's full history, newest first — a four-way union, like back-office's (053).
 *
 * ⚠ THE DRIVER'S TWO FACTS COME FROM THEIR OWN TABLES. The driver path records a collection in
 * `collection_task` and an arrival in `package_arrival` and does not always write `fulfillment_event`
 * — so a log built from the event table alone would say nothing after "ready for pickup". Where BOTH
 * exist (a staff-recorded arrival writes both, and so does the dev pickup stub), the event-table copy
 * is dropped so one fact appears once.
 */
const READ_ACTIVITY = `
SELECT * FROM (
  SELECT 'event'::text AS source, fe.id::text AS id, fe.occurred_at AS at,
         fe.event_type, fe.from_status, fe.to_status, fe.quantity, fe.detail,
         oi.product_name AS item_name,
         NULL::text AS amount, NULL::text AS refund_status, NULL::text AS refund_kind,
         'shop'::text AS actor_kind, ss.name AS actor_name
    FROM public.fulfillment_event fe
    JOIN public.shop_fulfillment sf ON sf.id = fe.shop_fulfillment_id
    LEFT JOIN public.order_item oi ON oi.id = fe.order_item_id
    LEFT JOIN public.shop_staff ss ON ss.id = fe.actor_staff_id
   WHERE sf.id = $1 AND sf.shop_id = $2
     AND NOT (fe.to_status LIKE 'collected%'
              AND EXISTS (SELECT 1 FROM public.collection_task ct
                           WHERE ct.shop_fulfillment_id = sf.id AND ct.collected_at IS NOT NULL))
     AND NOT (fe.to_status LIKE 'delivered%'
              AND EXISTS (SELECT 1 FROM public.package_arrival pa WHERE pa.shop_fulfillment_id = sf.id))

  UNION ALL

  SELECT 'refund', r.id::text, r.created_at,
         NULL, NULL, NULL, NULL, NULL, NULL,
         r.amount::text, r.status, r.kind,
         r.actor_kind, ss.name
    FROM public.shop_fulfillment sf
    JOIN public.refund r ON r.order_id = sf.order_id
    LEFT JOIN public.shop_staff ss ON ss.cognito_sub = r.actor_sub AND r.actor_kind = 'shop'
   WHERE sf.id = $1 AND sf.shop_id = $2

  UNION ALL

  SELECT 'collection', ct.id::text, ct.collected_at,
         NULL, NULL, ct.status, NULL, NULL, NULL,
         NULL, NULL, NULL, 'driver', NULL
    FROM public.collection_task ct
    JOIN public.shop_fulfillment sf ON sf.id = ct.shop_fulfillment_id
   WHERE sf.id = $1 AND sf.shop_id = $2 AND ct.collected_at IS NOT NULL

  UNION ALL

  SELECT 'arrival', pa.id::text, pa.arrived_at,
         NULL, NULL, pa.source, NULL, NULL, NULL,
         NULL, NULL, NULL, 'effy', NULL
    FROM public.package_arrival pa
    JOIN public.shop_fulfillment sf ON sf.id = pa.shop_fulfillment_id
   WHERE sf.id = $1 AND sf.shop_id = $2
) log
ORDER BY at DESC, id DESC
`;

/** Returns `null` when the portion is not this shop's, so the caller can refuse uniformly. */
export async function readActivity(
  fulfillmentId: string,
  shopId: string,
): Promise<ActivityRecord[] | null> {
  const owned = await query<{ id: string }>(
    `SELECT id FROM public.shop_fulfillment WHERE id = $1 AND shop_id = $2`,
    [fulfillmentId, shopId],
  );
  if (!owned.rows[0]) return null;
  const res = await query<ActivityRecord>(READ_ACTIVITY, [fulfillmentId, shopId]);
  return res.rows;
}

// ── Writes: tags and notes ──────────────────────────────────────────────────────────────────────

/**
 * Replace the portion's tag set, and record the change — in ONE transaction, so the log can never
 * claim a set the table does not hold.
 *
 * ⚠ A NO-OP WRITES NOTHING. Saving the same set twice (a retry, a double-click) must not leave two
 * "tags changed" entries saying nothing changed; a history full of those is one nobody reads.
 * Returns whether anything changed, or `null` when the portion is not this shop's.
 */
export async function replaceTags(
  fulfillmentId: string,
  shopId: string,
  tags: readonly string[],
  actorStaffId: string | null,
): Promise<boolean | null> {
  return withTransaction(async (client) => {
    // ⚠ Locks the portion row, so two operators saving at once serialise instead of each computing
    // "what changed" against a set the other is replacing.
    const owned = await client.query<{ id: string }>(
      `SELECT id FROM public.shop_fulfillment WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
      [fulfillmentId, shopId],
    );
    if (!owned.rows[0]) return null;

    const current = await client.query<{ tag: string }>(
      `SELECT tag FROM public.fulfillment_tag WHERE shop_fulfillment_id = $1 ORDER BY tag`,
      [fulfillmentId],
    );
    const before = current.rows.map((r) => r.tag);
    const after = [...tags].sort();
    if (before.length === after.length && before.every((t, i) => t === after[i])) return false;

    await client.query(
      `DELETE FROM public.fulfillment_tag
        WHERE shop_fulfillment_id = $1 AND NOT (tag = ANY($2::text[]))`,
      [fulfillmentId, after],
    );
    await client.query(
      `INSERT INTO public.fulfillment_tag (shop_fulfillment_id, tag, created_by_staff_id)
       SELECT $1, t, $3 FROM unnest($2::text[]) AS t
       ON CONFLICT (shop_fulfillment_id, tag) DO NOTHING`,
      [fulfillmentId, after, actorStaffId],
    );
    await appendEvent(client, {
      fulfillmentId,
      actorStaffId,
      eventType: "tags_changed",
      detail: after.join(", "),
    });
    return true;
  });
}

/** Append a note and its log entry together. `null` when the portion is not this shop's. */
export async function addNote(
  fulfillmentId: string,
  shopId: string,
  body: string,
  actorStaffId: string | null,
): Promise<string | null> {
  return withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.fulfillment_note (shop_fulfillment_id, body, author_staff_id)
       SELECT sf.id, $3, $4 FROM public.shop_fulfillment sf WHERE sf.id = $1 AND sf.shop_id = $2
       RETURNING id`,
      [fulfillmentId, shopId, body, actorStaffId],
    );
    const id = res.rows[0]?.id;
    if (!id) return null;
    await appendEvent(client, { fulfillmentId, actorStaffId, eventType: "note_added" });
    return id;
  });
}

// ── Money helpers ───────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ INTEGER CENTS, never floats — `numeric` arrives from pg as a string, and summing strings through
 * `Number` accumulates binary error on exactly the figures an operator reconciles against a bank.
 */
function cents(amount: string | null): number {
  if (!amount) return 0;
  const [whole = "0", frac = ""] = amount.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  return sign * (Math.abs(Number(whole)) * 100 + Number((frac + "00").slice(0, 2)));
}

function fromCents(c: number): string {
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Normalise a pg `numeric` string to exactly two decimals. */
function money(amount: string | null): string {
  return fromCents(cents(amount));
}

export const __test = { cents, fromCents, money, likePattern };
