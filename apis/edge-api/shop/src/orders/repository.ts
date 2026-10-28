// Every statement is bound to the `shopId` gate resolved, as in `fulfillments/repository.ts`. The
// portion is the only way in, so a caller only ever sees orders their shop is filling part of. Nothing
// client-supplied is spliced into SQL: sort columns come from a fixed map.

import { likePattern, orderBy, packageStatuses, presignRead, query, withTransaction, type Queryable } from "@effy/edge-shared";

import { collectionsFor } from "../collection/service";
import { courierPickups, pickupOf } from "../lib/courier-pickup";
import { STATUS_WORD, parcelCustodyOf, type PackageStatusView, type ParcelZone, type ShopLabelCommonDTO, type ShopOrderCollectionDTO, type StorageClass } from "@effy/shared-types";

import { appendEvent, emptyShelfFromPick } from "../fulfillments/repository";
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
import { SHOP_ORDER_LIST } from "./list";
import { ORDER_TABS } from "./types";
import { DELIVERED_BY_SQL, type DeliveredBy } from "../lib/delivered-by";

// Shared fragments, one definition each for the list and the detail.

/** `placed_at` from the paid transition; `created_at` covers a row without one. */
const PLACED = `COALESCE(o.placed_at, o.created_at)`;

/** At risk against its promise, in SQL so the filter and the badge agree; intervals from `promise.ts`. */
const AT_RISK = `(sf.status IN ('pending', 'received', 'picking')
  AND ${PLACED} + interval '${DEFAULT_READY_WINDOW_MS / 1000} seconds'
      <= now() + interval '${AT_RISK_THRESHOLD_MS / 1000} seconds')`;

/**
 * Where the money stands, derived from the refund rows; one expression for list and detail.
 * `refund_pending` ranks below `refunded`, and "submitted" counts as pending, never returned.
 */
function paymentStateSql(total: string, refunded: string, pending: string): string {
  return `CASE
    WHEN ${total} > 0 AND ${refunded} >= ${total} THEN 'refunded'
    WHEN ${pending} > 0 THEN 'refund_pending'
    WHEN ${refunded} > 0 THEN 'partially_refunded'
    ELSE 'paid'
  END`;
}

/** Split by whether the money has actually gone back. */
const REFUND_TOTALS = `
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'succeeded'), 0)                  AS settled,
           COALESCE(SUM(r.amount) FILTER (WHERE r.status IN ('submitting', 'submitted')), 0) AS pending
      FROM public.refund r
     WHERE r.order_id = o.id
  ) rf ON true`;

/**
 * Every portion this shop holds. `$1` shop · `$2` search over order number, customer, items and SKUs
 * (null = none) · `$3` attention · `$4` payment · `$5` method · `$6` range. The tab is not a predicate:
 * the per-tab counts are taken over this set.
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
         ${DELIVERED_BY_SQL} AS delivered_by,
         COALESCE(o.delivery_address ->> 'recipientName', '') AS customer_name,
         o.grand_total_amount AS total,
         o.currency,
         ${paymentStateSql("o.grand_total_amount", "rf.settled", "rf.pending")} AS payment,
         ${AT_RISK} AS at_risk,
         COALESCE(tg.tags, ARRAY[]::text[]) AS tags,
         COALESCE(li.items_summary, '') AS items_summary,
         COALESCE(li.skus, '') AS skus,
         CASE WHEN sf.status IN ('pending', 'received') THEN 'new' ELSE sf.status END AS tab
    FROM public.shop_fulfillment sf
    JOIN public."order" o ON o.id = sf.order_id
    LEFT JOIN LATERAL (
      SELECT SUM(x.gathered_quantity) AS gathered, SUM(x.unavailable_quantity) AS unavailable
        FROM public.fulfillment_item x
       WHERE x.shop_fulfillment_id = sf.id
    ) fi ON true
    ${REFUND_TOTALS}
    -- The design's Items column: "Eggs ×2, Oat milk" over THIS shop's lines only (the fan-out key,
    -- oi.shop_id = sf.shop_id, as everywhere else). SKUs ride along so search can match them.
    LEFT JOIN LATERAL (
      -- A line is named with its variant ("Rice (1 kg) ×2"); the codes are the sold snapshot.
      SELECT string_agg(split_part(oi.product_name, ',', 1)
                          || CASE WHEN oi.variant_label IS NULL THEN '' ELSE ' (' || oi.variant_label || ')' END
                          || ' ×' || oi.quantity, ', '
                        ORDER BY oi.product_name, oi.variant_label NULLS FIRST, oi.id) AS items_summary,
             string_agg(COALESCE(oi.sku, '') || ' ' || COALESCE(oi.gtin, ''), ' ') AS skus
        FROM public.order_item oi
       WHERE oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
    ) li ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(t.tag ORDER BY t.tag) AS tags
        FROM public.fulfillment_tag t
       WHERE t.shop_fulfillment_id = sf.id
    ) tg ON true
   WHERE sf.shop_id = $1
), filtered AS (
  SELECT *
    FROM base
   WHERE ($2::text IS NULL OR order_number ILIKE $2 OR customer_name ILIKE $2
          OR items_summary ILIKE $2 OR skus ILIKE $2)
     AND (   $3::text = 'any'
          OR ($3::text = 'at_risk'  AND at_risk)
          OR ($3::text = 'short'    AND unavailable_count > 0)
          OR ($3::text = 'on_track' AND NOT at_risk AND unavailable_count = 0))
     AND ($4::text = 'any' OR payment = $4)
     -- Who takes it away.
     AND ($6::text = 'any' OR delivered_by = $6)
     AND (   $5::text = 'any'
          -- ⚠ "Today" is the Melbourne day, not the server's UTC day — a 9am
          -- order in Melbourne is still "yesterday" in UTC.
          OR ($5::text = 'today' AND placed_at >= (date_trunc('day', now() AT TIME ZONE 'Australia/Melbourne')
                                             AT TIME ZONE 'Australia/Melbourne'))
          OR ($5::text = '7d'  AND placed_at >= now() - interval '7 days')
          OR ($5::text = '30d' AND placed_at >= now() - interval '30 days'))
)`;

interface RowRecord {
  id: string;
  order_number: string;
  placed_at: Date;
  status: FulfillmentStatus;
  item_count: number;
  gathered_count: number;
  unavailable_count: number;
  delivered_by: DeliveredBy;
  customer_name: string;
  total: string;
  currency: string;
  payment: PaymentState;
  at_risk: boolean;
  tags: string[];
  items_summary: string;
  full_count: string;
}

/** Through `query`, so container tests ask their own database. */
const db: Queryable = { query: (text, values) => query(text, values) };

/** Never claims progress it cannot see. */
const fallbackView = (): PackageStatusView => ({ status: "preparing", word: STATUS_WORD.preparing, detail: null, driverName: null });

/** Through the shared derivation, with driver names stripped (`audience: "shop"`). */
async function shopStatuses(ids: readonly string[]): Promise<Map<string, PackageStatusView>> {
  return packageStatuses(db, ids, "shop");
}

export async function listOrders(shopId: string, q: OrderListQuery): Promise<OrderList> {
  const filterArgs = [shopId, q.q.trim() ? likePattern(q.q.trim()) : null, q.attention, q.payment, q.range, q.deliveredBy];
  const offset = (q.page - 1) * q.pageSize;

  const [page, counts] = await Promise.all([
    query<RowRecord>(
      `${FILTERED}
       SELECT *, count(*) OVER () AS full_count
         FROM filtered
        WHERE ($7::text = 'all' OR tab = $7::text)
        ${orderBy(SHOP_ORDER_LIST, q as unknown as Parameters<typeof orderBy>[1])}
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

  const ids = page.rows.map((r) => r.id);
  const [statuses, pickups, collections] = await Promise.all([
    shopStatuses(ids),
    courierPickups(shopId, ids),
    collectionsFor(shopId, ids),
  ]);
  return {
    items: page.rows.map((r) => ({
      ...toRow(r),
      ...pickupOf(pickups, r.id),
      ...collectionOf(collections, r.id),
      statusView: statuses.get(r.id) ?? fallbackView(),
    })),
    // Past the last page there are no rows for the window function, so the total falls back to the tab's count.
    total: page.rows[0] ? Number(page.rows[0].full_count) : byTab[q.tab],
    page: q.page,
    pageSize: q.pageSize,
    counts: byTab,
  };
}

function toRow(r: RowRecord): Omit<OrderRow, "statusView"> {
  return {
    id: r.id,
    orderNumber: r.order_number,
    customerName: r.customer_name,
    placedAt: r.placed_at,
    status: r.status,
    itemCount: r.item_count,
    gatheredCount: r.gathered_count,
    unavailableCount: r.unavailable_count,
    deliveredBy: r.delivered_by,
    atRisk: r.at_risk,
    payment: r.payment,
    total: money(r.total),
    currency: r.currency,
    tags: r.tags,
    itemsSummary: r.items_summary,
  };
}

interface HeadRecord {
  id: string;
  order_id: string;
  order_number: string;
  placed_at: Date;
  paid_at: Date | null;
  status: FulfillmentStatus;
  state_changed_at: Date;
  delivered_by: DeliveredBy;
  unfulfillable_reason: string | null;
  delivery_address: Record<string, unknown> | null;
  item_subtotal_amount: string;
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
  delivered_at: Date | null;
}

/** The delivery snapshot is the only address selected (the address guard reads this file). */
const READ_HEAD = `
SELECT sf.id, sf.order_id, o.order_number,
       ${PLACED} AS placed_at, o.placed_at AS paid_at,
       sf.status, sf.state_changed_at, sf.unfulfillable_reason,
       ${DELIVERED_BY_SQL} AS delivered_by,
       o.delivery_address,
       o.item_subtotal_amount, o.discount_amount, o.promo_code,
       o.grand_total_amount, o.currency,
       p.amount AS payment_amount, p.method_type, p.method_brand, p.method_last4,
       rf.settled AS refunded, rf.pending AS refund_pending,
       ${paymentStateSql("o.grand_total_amount", "rf.settled", "rf.pending")} AS payment,
       ${AT_RISK} AS at_risk,
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
  variant_label: string | null;
  variant_code: string | null;
  sku: string | null;
  gtin: string | null;
  pick_note: string | null;
  storage_key: string | null;
  storage_class: StorageClass;
  ordered_quantity: number;
  gathered_quantity: number | null;
  unavailable_quantity: number | null;
  refunded_quantity: string | null;
  unit_price_amount: string;
  line_subtotal_amount: string;
}

/**
 * This shop's lines (`oi.shop_id = sf.shop_id`), priced from the receipt. `refunded_quantity` counts
 * every refund not failed or refused, pending included, so a unit is never refunded twice.
 */
const READ_LINES = `
SELECT oi.id AS order_item_id,
       oi.product_name AS name,
       -- The variant, its stock code and its barcode AS SOLD (snapshots on the line).
       oi.variant_label,
       oi.variant_code,
       oi.sku,
       oi.gtin,
       pm.storage_key,
       -- Ambient, chilled or frozen as sold: the pick list's walking order (099).
       oi.storage_class,
       oi.quantity AS ordered_quantity,
       fi.gathered_quantity,
       fi.unavailable_quantity,
       fi.pick_note,
       (SELECT SUM(rl.quantity)
          FROM public.refund_line rl
          JOIN public.refund r ON r.id = rl.refund_id
         WHERE rl.order_item_id = oi.id
           AND r.status NOT IN ('failed', 'refused')) AS refunded_quantity,
       -- ⚠ a shop is shown its OWN price for a line — what it is owed — not what the customer paid.
       oi.shop_unit_price_amount AS unit_price_amount,
       oi.shop_line_subtotal_amount AS line_subtotal_amount
  FROM public.shop_fulfillment sf
  JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
  -- The line's picture: the sold variant's own, else the product's primary (decoration only).
  LEFT JOIN public.product_variant pv ON pv.id = oi.variant_id
  LEFT JOIN LATERAL (
      SELECT m.storage_key FROM public.product_media m
       WHERE m.product_id = oi.product_id AND (m.id = pv.media_id OR m.is_primary)
       ORDER BY (m.id = pv.media_id) DESC LIMIT 1
  ) pm ON true
  LEFT JOIN public.fulfillment_item fi
         ON fi.shop_fulfillment_id = sf.id AND fi.order_item_id = oi.id
 WHERE sf.id = $1 AND sf.shop_id = $2
 ORDER BY oi.product_name ASC, oi.variant_label ASC NULLS FIRST, oi.id ASC
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

/** Every refund on the order. Only a shop actor is named; a back-office refund reads "Effy". */
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

/** Live bags. "Printed" means since the bag's number or zone last changed; custody never names a driver. */
const READ_PARCELS = `
  SELECT p.id, p.parcel_code, p.seq, p.zone,
         count(*) OVER ()::int AS of,
         (SELECT count(*) FROM public.label_print lp WHERE lp.parcel_id = p.id)::int AS print_count,
         (SELECT min(lp.printed_at) FROM public.label_print lp WHERE lp.parcel_id = p.id) AS first_printed_at,
         (SELECT max(lp.printed_at) FROM public.label_print lp WHERE lp.parcel_id = p.id) AS last_printed_at,
         (SELECT ss.name FROM public.label_print lp LEFT JOIN public.shop_staff ss ON ss.id = lp.shop_staff_id
           WHERE lp.parcel_id = p.id ORDER BY lp.printed_at DESC LIMIT 1) AS last_printed_by,
         EXISTS (SELECT 1 FROM public.label_print lp WHERE lp.parcel_id = p.id AND lp.printed_at >= p.numbered_at) AS printed_current,
         p.pack_scanned_at, ps.name AS pack_scanned_by,
         (SELECT h.step FROM public.package_handover h WHERE h.parcel_id = p.id ORDER BY h.recorded_at DESC LIMIT 1) AS last_step,
         (SELECT min(lp.printed_at) FROM public.label_print lp
            JOIN public.package_parcel p2 ON p2.id = lp.parcel_id WHERE p2.shop_fulfillment_id = p.shop_fulfillment_id) AS packed_on
    FROM public.package_parcel p
    JOIN public.shop_fulfillment sf ON sf.id = p.shop_fulfillment_id
    LEFT JOIN public.shop_staff ps ON ps.id = p.pack_scanned_by_staff_id
   WHERE p.shop_fulfillment_id = $1 AND sf.shop_id = $2 AND p.voided_at IS NULL
   ORDER BY p.seq
`;

/** From the line snapshot. */
const READ_ZONES_NEEDED = `
  SELECT DISTINCT oi.storage_class
    FROM public.shop_fulfillment sf
    JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
   WHERE sf.id = $1 AND sf.shop_id = $2 AND oi.storage_class IN ('chilled', 'frozen')
   ORDER BY 1
`;

interface ParcelRecord {
  id: string;
  parcel_code: string;
  seq: number;
  zone: ParcelZone;
  of: number;
  print_count: number;
  first_printed_at: Date | null;
  last_printed_at: Date | null;
  last_printed_by: string | null;
  printed_current: boolean;
  pack_scanned_at: Date | null;
  pack_scanned_by: string | null;
  last_step: string | null;
  packed_on: Date | null;
}

export async function readOrder(fulfillmentId: string, shopId: string): Promise<OrderDetail> {
  const head = await query<HeadRecord>(READ_HEAD, [fulfillmentId, shopId]);
  const row = head.rows[0];
  // Missing and another shop's are indistinguishable; the handler answers 403.
  if (!row) throw new FulfillmentError("not_found", "order not found");

  const args = [fulfillmentId, shopId];
  const [lines, refunds, tags, notes, bags, zones, scanRule] = await Promise.all([
    query<LineRecord>(READ_LINES, args),
    query<RefundRecord>(READ_REFUNDS, args),
    query<{ tag: string }>(READ_TAGS, args),
    query<{ id: string; body: string; author_name: string | null; created_at: Date }>(READ_NOTES, args),
    query<ParcelRecord>(READ_PARCELS, args),
    query<{ storage_class: ParcelZone }>(READ_ZONES_NEEDED, args),
    // Whether every bag must be scanned as packed (fleet writes it).
    query<{ pack_scan_required: boolean }>(`SELECT pack_scan_required FROM public.shop WHERE id = $1`, [shopId]),
  ]);
  const mappedLines = await Promise.all(lines.rows.map(toLine));
  const shopSubtotal = lines.rows.reduce((c, l) => c + cents(l.line_subtotal_amount), 0);
  const total = cents(row.grand_total_amount);
  const refunded = cents(row.refunded);

  // Never a driver's name.
  const [statuses, pickups, collections] = await Promise.all([
    shopStatuses([fulfillmentId]),
    courierPickups(shopId, [fulfillmentId]),
    collectionsFor(shopId, [fulfillmentId]),
  ]);
  const statusView = statuses.get(fulfillmentId) ?? fallbackView();
  return {
    ...pickupOf(pickups, fulfillmentId),
    ...collectionOf(collections, fulfillmentId),
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    placedAt: row.placed_at,
    status: row.status,
    statusView,
    stateChangedAt: row.state_changed_at,
    readyBy: new Date(row.placed_at.getTime() + DEFAULT_READY_WINDOW_MS),
    deliveredBy: row.delivered_by,
    atRisk: row.at_risk,
    delivery: mapDelivery(row.delivery_address ?? {}),
    lines: mappedLines,
    money: {
      currency: row.currency,
      shopSubtotal: fromCents(shopSubtotal),
      itemSubtotal: money(row.item_subtotal_amount),
      discount: money(row.discount_amount),
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
      deliveredAt: row.delivered_at,
      unfulfillableReason: row.unfulfillable_reason,
    },
    parcels: bags.rows.map((b) => ({
      parcelId: b.id,
      code: b.parcel_code,
      seq: Number(b.seq),
      of: Number(b.of),
      zone: b.zone,
      printed: {
        count: Number(b.print_count),
        firstAt: b.first_printed_at ? b.first_printed_at.toISOString() : null,
        lastAt: b.last_printed_at ? b.last_printed_at.toISOString() : null,
        current: b.printed_current,
      },
      packScanned: b.pack_scanned_at ? { at: b.pack_scanned_at.toISOString(), by: b.pack_scanned_by } : null,
      custody: parcelCustodyOf(b.last_step),
    })),
    labelCommon: labelCommonOf(row, bags.rows[0]?.packed_on ?? null),
    zonesNeeded: zones.rows.map((z) => z.storage_class),
    packScanRequired: scanRule.rows[0]?.pack_scan_required ?? false,
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
    variantLabel: r.variant_label,
    variantCode: r.variant_code,
    sku: r.sku,
    gtin: r.gtin,
    // Presigned: the raw storage key cannot be loaded by a browser.
    imageUrl: r.storage_key ? await presignRead(r.storage_key) : null,
    orderedQuantity: r.ordered_quantity,
    gatheredQuantity: r.gathered_quantity ?? 0,
    unavailableQuantity: r.unavailable_quantity ?? 0,
    refundedQuantity: Number(r.refunded_quantity ?? 0),
    pickNote: r.pick_note,
    storageClass: r.storage_class,
    unitPrice: money(r.unit_price_amount),
    lineTotal: money(r.line_subtotal_amount),
  };
}

/** See READ_REFUNDS for why back-office is not named. */
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

/** Never a window, day, price, phone or email. */
function labelCommonOf(row: HeadRecord, packedOn: Date | null): ShopLabelCommonDTO {
  const a = (row.delivery_address ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");
  return {
    service: row.delivered_by,
    orderNumber: row.order_number,
    packedOn: packedOn ? packedOn.toISOString().slice(0, 10) : null,
    // The shipping address, never the payer's.
    recipientName: s("recipientName"),
    line1: s("line1"),
    line2: s("line2") || null,
    suburb: s("city"),
    state: s("region"),
    postcode: s("postalCode"),
    country: s("country") || null,
    phone: s("phone") || null,
  };
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
  /** For "2 of 3 picked"; item events only. */
  item_ordered: number | null;
  amount: string | null;
  refund_status: string | null;
  refund_kind: string | null;
  actor_kind: string | null;
  actor_name: string | null;
}

/**
 * Newest first: a union of the portion's events and `package_arrival`, de-duplicated. Nothing records
 * the journey, so the log goes from "ready for pickup" to "arrived".
 */
const READ_ACTIVITY = `
SELECT * FROM (
  SELECT 'event'::text AS source, fe.id::text AS id, fe.occurred_at AS at,
         fe.event_type, fe.from_status, fe.to_status, fe.quantity, fe.detail,
         oi.product_name AS item_name, oi.quantity AS item_ordered,
         NULL::text AS amount, NULL::text AS refund_status, NULL::text AS refund_kind,
         'shop'::text AS actor_kind, ss.name AS actor_name
    FROM public.fulfillment_event fe
    JOIN public.shop_fulfillment sf ON sf.id = fe.shop_fulfillment_id
    LEFT JOIN public.order_item oi ON oi.id = fe.order_item_id
    LEFT JOIN public.shop_staff ss ON ss.id = fe.actor_staff_id
   WHERE sf.id = $1 AND sf.shop_id = $2
     AND NOT (fe.to_status LIKE 'delivered%'
              AND EXISTS (SELECT 1 FROM public.package_arrival pa WHERE pa.shop_fulfillment_id = sf.id))

  UNION ALL

  SELECT 'refund', r.id::text, r.created_at,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL::int,
         r.amount::text, r.status, r.kind,
         r.actor_kind, ss.name
    FROM public.shop_fulfillment sf
    JOIN public.refund r ON r.order_id = sf.order_id
    LEFT JOIN public.shop_staff ss ON ss.cognito_sub = r.actor_sub AND r.actor_kind = 'shop'
   WHERE sf.id = $1 AND sf.shop_id = $2

  UNION ALL

  SELECT 'arrival', pa.id::text, pa.arrived_at,
         NULL, NULL, pa.source, NULL, NULL, NULL, NULL::int,
         NULL, NULL, NULL, 'effy', NULL
    FROM public.package_arrival pa
    JOIN public.shop_fulfillment sf ON sf.id = pa.shop_fulfillment_id
   WHERE sf.id = $1 AND sf.shop_id = $2
) log
ORDER BY at DESC, id DESC
`;

/** `null` when the portion is not this shop's. */
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

/**
 * Replaces the tag set and logs it in one transaction. A no-op writes nothing. Returns whether anything
 * changed, or `null` when the portion is not this shop's.
 */
export async function replaceTags(
  fulfillmentId: string,
  shopId: string,
  tags: readonly string[],
  actorStaffId: string | null,
): Promise<boolean | null> {
  return withTransaction(async (client) => {
    // Locks the portion row, so two operators saving at once serialise.
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

/** `null` when the portion is not this shop's. */
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

/** Absolute counts derived from the operator's mode. */
export interface PickWrite {
  orderItemId: string;
  mode: "full" | "part" | "unavailable" | "none";
  /** Meaningful for `part`; derived for the others. */
  units: number;
  note: string | null;
}

/**
 * Every line and its log entry in one transaction. A mode becomes two absolute numbers:
 *  full → gathered = ordered, unavailable = 0 · part → gathered = n, unavailable = ordered − n
 *  unavailable → gathered = 0, unavailable = ordered · none → both 0.
 * "part" records the remainder as unavailable, so the shortfall path sees it. Upserted, scoped through
 * the portion. `null` when the portion is not this shop's; `validation` for a line not on it.
 */
export async function applyPicks(
  fulfillmentId: string,
  shopId: string,
  picks: readonly PickWrite[],
  actorStaffId: string | null,
): Promise<true | null> {
  return withTransaction(async (client) => {
    const owned = await client.query<{ id: string }>(
      `SELECT id FROM public.shop_fulfillment WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
      [fulfillmentId, shopId],
    );
    if (!owned.rows[0]) return null;

    for (const p of picks) {
      const line = await client.query<{ ordered: number }>(
        `SELECT oi.quantity AS ordered
           FROM public.shop_fulfillment sf
           JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
          WHERE sf.id = $1 AND oi.id = $2`,
        [fulfillmentId, p.orderItemId],
      );
      const ordered = line.rows[0]?.ordered;
      if (ordered === undefined) {
        throw new FulfillmentError("validation", "that item is not part of this order", [
          { field: "lines", message: `unknown line ${p.orderItemId}` },
        ]);
      }
      if (p.mode === "part" && (p.units < 1 || p.units > ordered)) {
        throw new FulfillmentError("validation", `only ${ordered} ordered`, [
          { field: "units", message: p.units < 1 ? "use unavailable instead of 0" : `only ${ordered} ordered` },
        ]);
      }
      const gathered = p.mode === "full" ? ordered : p.mode === "part" ? p.units : 0;
      const unavailable =
        p.mode === "unavailable" ? ordered : p.mode === "part" ? ordered - p.units : 0;

      await client.query(
        `INSERT INTO public.fulfillment_item
                (shop_fulfillment_id, order_item_id, ordered_quantity, gathered_quantity, unavailable_quantity, pick_note)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (shop_fulfillment_id, order_item_id) DO UPDATE
            SET gathered_quantity = EXCLUDED.gathered_quantity,
                unavailable_quantity = EXCLUDED.unavailable_quantity,
                pick_note = EXCLUDED.pick_note,
                updated_at = now()`,
        [fulfillmentId, p.orderItemId, ordered, gathered, unavailable, p.note],
      );

      await appendEvent(client, {
        fulfillmentId,
        actorStaffId,
        eventType: p.mode === "unavailable" ? "item_unavailable" : "item_gathered",
        orderItemId: p.orderItemId,
        quantity: p.mode === "unavailable" ? ordered : gathered,
        detail: p.note,
      });

      // A real shortfall empties the shelf count.
      if (unavailable > 0) await emptyShelfFromPick(client, p.orderItemId, actorStaffId);
    }
    return true;
  });
}

/** Integer cents: `numeric` arrives as a string, and summing through `Number` accumulates error. */
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

/** Exactly two decimals. */
function money(amount: string | null): string {
  return fromCents(cents(amount));
}

export const __test = { cents, fromCents, money, likePattern };

/** `{ collection }` when an Effy driver will collect the package, else nothing (099). */
function collectionOf(m: Map<string, ShopOrderCollectionDTO>, id: string): { collection?: ShopOrderCollectionDTO } {
  const c = m.get(id);
  return c ? { collection: c } : {};
}
