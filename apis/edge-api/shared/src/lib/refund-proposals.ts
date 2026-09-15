// Proposed refunds — ONE derivation, now read by two services (058, promoted from
// edge-api/orders/src/orders/refunds.ts where 055 wrote it).
//
// ⚠ PROMOTED RATHER THAN COPIED (Principle II). Back-office reads proposals to decide a refund on
// an order; the shop console reads the same proposals for its own portion, to put "Refund waiting
// for approval" on Today. Two copies of this SQL would be two answers to "what does the platform
// still owe this customer", and the one that drifted would be invisible — it is a SELECT, so
// nothing would fail, the two screens would simply disagree. 028 made the same move with the S3
// presign helper, and the proof that it changed nothing was the other service's suite passing
// unmodified.
//
// ⚠ PROPOSALS ARE DERIVED, AND THERE IS NO PROPOSALS TABLE (055 FR-004a). A proposal is a *view of
// other facts*: a pick shortfall the picker recorded, minus anything already refunded against that
// line, minus anything a human has dismissed. Storing it would let it disagree with the shortfall it
// came from — a picker correcting a quantity would leave a stale proposal behind. Deriving makes
// that requirement free instead of a reconciliation job (027's counted-not-stored rule).
//
// ⚠ GROUPED BY ORDER ITEM, not by shortfall row: one product short across two pick records is one
// decision, not two.
import { query } from "./db";

export interface ProposedRefundRow {
  order_item_id: string;
  product_name: string;
  quantity: number;
  amount: string;
}

/** A proposal with the portion it belongs to — what a shop-scoped caller needs to link a row. */
export interface ProposedRefundForShopRow extends ProposedRefundRow {
  shop_fulfillment_id: string;
  order_id: string;
  order_number: string;
  /** When the shortfall that created this proposal was last recorded — the row's "waiting since". */
  since: Date;
}

// The shortfall, minus what has been refunded, minus what a human dismissed. Written once here and
// shared by both scopings below, so the RULE cannot differ between them — only the WHERE that picks
// which rows to apply it to.
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

/** Every unresolved proposal on ONE order, whichever shop is short (back-office's view, 055). */
export async function proposedRefunds(orderId: string): Promise<ProposedRefundRow[]> {
  const res = await query<ProposedRefundRow>(
    `SELECT oi.id::text AS order_item_id,
            oi.product_name,
            SUM(fi.unavailable_quantity)::int AS quantity,
            (SUM(fi.unavailable_quantity) * oi.unit_price_amount)::text AS amount
       FROM public.fulfillment_item fi
       JOIN public.order_item oi        ON oi.id = fi.order_item_id
       JOIN public.shop_fulfillment sf  ON sf.id = fi.shop_fulfillment_id
      WHERE oi.order_id = $1
        AND ${UNRESOLVED_SHORTFALL}
   GROUP BY oi.id, oi.product_name, oi.unit_price_amount
   ORDER BY oi.product_name`,
    [orderId],
  );
  return res.rows;
}

/**
 * Every unresolved proposal at ONE shop, across its open orders (the shop console's view, 058).
 *
 * ⚠ Scoped by the portion's `shop_id`, resolved from the operator's own record — never from a
 * request parameter. One row per (portion, order item), aggregated the same way as above, so a shop
 * sees exactly the proposals a back-office operator would see for its lines, and no others.
 */
export async function proposedRefundsForShop(
  shopId: string,
  limit: number,
): Promise<ProposedRefundForShopRow[]> {
  const res = await query<ProposedRefundForShopRow>(
    `SELECT sf.id::text  AS shop_fulfillment_id,
            o.id::text   AS order_id,
            o.order_number,
            oi.id::text  AS order_item_id,
            oi.product_name,
            SUM(fi.unavailable_quantity)::int AS quantity,
            (SUM(fi.unavailable_quantity) * oi.unit_price_amount)::text AS amount,
            MAX(sf.state_changed_at) AS since
       FROM public.fulfillment_item fi
       JOIN public.order_item oi       ON oi.id = fi.order_item_id
       JOIN public.shop_fulfillment sf ON sf.id = fi.shop_fulfillment_id
       JOIN public."order" o           ON o.id = sf.order_id
      WHERE sf.shop_id = $1
        AND ${UNRESOLVED_SHORTFALL}
   GROUP BY sf.id, o.id, o.order_number, oi.id, oi.product_name, oi.unit_price_amount
   ORDER BY MAX(sf.state_changed_at) ASC
      LIMIT $2`,
    [shopId, limit],
  );
  return res.rows;
}
