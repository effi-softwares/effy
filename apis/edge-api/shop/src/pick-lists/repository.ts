// Batch pick lists — every order waiting to be picked, as printable documents (058, US4).
//
// ⚠ NO MONEY ON A PICK LIST (020's rule for the pick document). The console shows an order's money
// on screen by operator decision (057 A3); a sheet that goes out to the shelves does not need it and
// should not carry it — pick lists get left on benches.
import { query } from "@effy/edge-shared";
import type { CourierPickupDTO } from "@effy/shared-types";

import { courierPickups, pickupOf } from "../lib/courier-pickup";

import { DELIVERED_BY_SQL, type DeliveredBy } from "../lib/delivered-by";

/** A hard ceiling: a shop with 400 orders waiting needs help, not 400 sheets of paper. */
export const MAX_PICK_LISTS = 100;

export interface PickListRow {
  fulfillmentId: string;
  orderNumber: string;
  customerName: string;
  paidAt: Date;
  /** 079 — who takes it away: what the printed sheet says, never "same-day" or "standard". */
  deliveredBy: DeliveredBy;
  /** 080 — present only when a courier collects this package from the shop. */
  courierPickup?: CourierPickupDTO;
  /** @deprecated 079 — the customer's word; shops are shown `deliveredBy`. */
  deliveryMethod: "same_day" | "standard" | null;
  lines: Array<{ name: string; sku: string | null; quantity: number }>;
}

/**
 * Oldest first — the same order the queue itself uses (020 FR-001b), so a printed stack matches the
 * screen an operator just looked at.
 */
const SELECT_PICK_LISTS = `
SELECT sf.id::text AS fulfillment_id,
       o.order_number,
       COALESCE(o.delivery_address ->> 'recipientName', '') AS customer_name,
       COALESCE(o.placed_at, o.created_at) AS paid_at,
       sf.delivery_method,
       ${DELIVERED_BY_SQL} AS delivered_by,
       COALESCE(
         json_agg(
           json_build_object('name', oi.product_name, 'sku', p.sku, 'quantity', oi.quantity)
           ORDER BY oi.product_name
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'::json
       ) AS lines
  FROM public.shop_fulfillment sf
  JOIN public."order" o ON o.id = sf.order_id
  LEFT JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
  LEFT JOIN public.product p ON p.id = oi.product_id
 WHERE sf.shop_id = $1
   AND sf.status IN ('pending', 'received')
 GROUP BY sf.id, o.order_number, o.delivery_address, o.placed_at, o.created_at, sf.delivery_method, o.delivery_type
 ORDER BY COALESCE(o.placed_at, o.created_at) ASC
 LIMIT $2
`;

const COUNT_AWAITING = `
SELECT COUNT(*)::int AS n
  FROM public.shop_fulfillment sf
 WHERE sf.shop_id = $1 AND sf.status IN ('pending', 'received')
`;

interface PickListDbRow {
  fulfillment_id: string;
  order_number: string;
  customer_name: string;
  paid_at: Date;
  delivery_method: "same_day" | "standard" | null;
  delivered_by: DeliveredBy;
  lines: Array<{ name: string; sku: string | null; quantity: number }>;
}

export async function readPickLists(
  shopId: string,
  limit = MAX_PICK_LISTS,
): Promise<{ lists: PickListRow[]; more: number }> {
  const [rows, total] = await Promise.all([
    query<PickListDbRow>(SELECT_PICK_LISTS, [shopId, limit]),
    query<{ n: number }>(COUNT_AWAITING, [shopId]),
  ]);

  const pickups = await courierPickups(shopId, rows.rows.map((r) => r.fulfillment_id));
  const lists = rows.rows.map((r) => ({
    ...pickupOf(pickups, r.fulfillment_id),
    fulfillmentId: r.fulfillment_id,
    orderNumber: r.order_number,
    customerName: r.customer_name,
    paidAt: r.paid_at,
    deliveredBy: r.delivered_by,
    deliveryMethod: r.delivery_method,
    lines: r.lines,
  }));

  // ⚠ The remainder is REPORTED, not hidden. A print that quietly covers the first hundred of two
  // hundred orders is how half a shop's work goes unpicked with nobody aware.
  return { lists, more: Math.max(0, (total.rows[0]?.n ?? 0) - lists.length) };
}
