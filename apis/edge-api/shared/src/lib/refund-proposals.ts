// Proposed refunds, derived and never stored: a pick shortfall, minus what was refunded against that
// line, minus what a person dismissed. Read by back-office (per order) and the shop console (Today).
// Grouped by order item: one product short across two pick records is one decision.
import { query } from "./db";

export interface ProposedRefundRow {
  order_item_id: string;
  product_name: string;
  quantity: number;
  amount: string;
}

/** With its portion, for a shop-scoped caller. */
export interface ProposedRefundForShopRow extends ProposedRefundRow {
  shop_fulfillment_id: string;
  order_id: string;
  order_number: string;
  /** When the shortfall was last recorded: "waiting since". */
  since: Date;
}

// The rule, written once for both scopings; only the where differs.
const UNRESOLVED_SHORTFALL = `
        fi.unavailable_quantity > 0
        -- Already refunded, in whole or in part: only the remainder is still a decision.
        AND fi.unavailable_quantity > COALESCE((
              SELECT SUM(rl.quantity)
                FROM public.refund_line rl
                JOIN public.refund r ON r.id = rl.refund_id
               WHERE rl.order_item_id = oi.id
                 AND r.status IN ('submitting','submitted','succeeded','failed')), 0)
        -- ⚠ A human looked and said no. The ONLY thing about a proposal that is stored, because it is
        -- the one fact the derivation cannot hold.
        AND NOT EXISTS (
              SELECT 1 FROM public.refund_proposal_dismissal d
               WHERE d.shop_fulfillment_id = sf.id AND d.order_item_id = oi.id)
`;

/** On one order, whichever shop is short. */
export async function proposedRefunds(orderId: string): Promise<ProposedRefundRow[]> {
  const res = await query<ProposedRefundRow>(
    `SELECT oi.id::text AS order_item_id,
            CASE WHEN oi.variant_label IS NULL THEN oi.product_name ELSE oi.product_name || ' — ' || oi.variant_label END AS product_name,
            SUM(fi.unavailable_quantity)::int AS quantity,
            (SUM(fi.unavailable_quantity) * oi.unit_price_amount)::text AS amount
       FROM public.fulfillment_item fi
       JOIN public.order_item oi        ON oi.id = fi.order_item_id
       JOIN public.shop_fulfillment sf  ON sf.id = fi.shop_fulfillment_id
      WHERE oi.order_id = $1
        AND ${UNRESOLVED_SHORTFALL}
   GROUP BY oi.id, oi.product_name, oi.variant_label, oi.unit_price_amount
   ORDER BY oi.product_name, oi.variant_label NULLS FIRST`,
    [orderId],
  );
  return res.rows;
}

/** At one shop, scoped by the portion's `shop_id` from the operator's own record. */
export async function proposedRefundsForShop(
  shopId: string,
  limit: number,
): Promise<ProposedRefundForShopRow[]> {
  const res = await query<ProposedRefundForShopRow>(
    `SELECT sf.id::text  AS shop_fulfillment_id,
            o.id::text   AS order_id,
            o.order_number,
            oi.id::text  AS order_item_id,
            CASE WHEN oi.variant_label IS NULL THEN oi.product_name ELSE oi.product_name || ' — ' || oi.variant_label END AS product_name,
            SUM(fi.unavailable_quantity)::int AS quantity,
            (SUM(fi.unavailable_quantity) * oi.unit_price_amount)::text AS amount,
            MAX(sf.state_changed_at) AS since
       FROM public.fulfillment_item fi
       JOIN public.order_item oi       ON oi.id = fi.order_item_id
       JOIN public.shop_fulfillment sf ON sf.id = fi.shop_fulfillment_id
       JOIN public."order" o           ON o.id = sf.order_id
      WHERE sf.shop_id = $1
        AND ${UNRESOLVED_SHORTFALL}
   GROUP BY sf.id, o.id, o.order_number, oi.id, oi.product_name, oi.variant_label, oi.unit_price_amount
   ORDER BY MAX(sf.state_changed_at) ASC
      LIMIT $2`,
    [shopId, limit],
  );
  return res.rows;
}
