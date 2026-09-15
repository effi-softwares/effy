// Batch pick lists — every order waiting to be picked, as printable documents (058, US4).
//
// ⚠ NO MONEY ON A PICK LIST (020's rule for the pick document). The console shows an order's money
// on screen by operator decision (057 A3); a sheet that goes out to the shelves does not need it and
// should not carry it — pick lists get left on benches.
import { query } from "@effy/edge-shared";

/** A hard ceiling: a shop with 400 orders waiting needs help, not 400 sheets of paper. */
export const MAX_PICK_LISTS = 100;

export interface PickListRow {
  fulfillmentId: string;
  orderNumber: string;
  customerName: string;
  paidAt: Date;
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
 GROUP BY sf.id, o.order_number, o.delivery_address, o.placed_at, o.created_at, sf.delivery_method
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

  const lists = rows.rows.map((r) => ({
    fulfillmentId: r.fulfillment_id,
    orderNumber: r.order_number,
    customerName: r.customer_name,
    paidAt: r.paid_at,
    deliveryMethod: r.delivery_method,
    lines: r.lines,
  }));

  // ⚠ The remainder is REPORTED, not hidden. A print that quietly covers the first hundred of two
  // hundred orders is how half a shop's work goes unpicked with nobody aware.
  return { lists, more: Math.max(0, (total.rows[0]?.n ?? 0) - lists.length) };
}
