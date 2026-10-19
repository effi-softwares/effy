import type { ProductOfferDTO } from "@effy/shared-types";

import { offerLabelOf } from "./terms";

/**
 * The offer a product shows on listings and its own page (094 R11): the oldest Active, automatic,
 * everyone-audience item or buy-X-get-Y promotion that covers it — directly, through its category or
 * any ancestor, or through its brand. Personal and code offers are not shown on products; the cart
 * applies them.
 *
 * `PRODUCT_OFFER_SQL(alias, at)` is a scalar subquery yielding the promotion id (or NULL), so a listing
 * adds one column (a small JSON object), turned into the badge by `productOffer` — no second read.
 */
export const PRODUCT_OFFER_SQL = (product: string, at: string): string => `(
  SELECT json_build_object('id', po.id, 'kind', po.kind, 'valueType', po.value_type, 'percentOff', po.percent_off, 'amountOff', po.amount_off, 'buy', po.bxgy_buy_qty, 'get', po.bxgy_get_qty, 'label', po.label) FROM public.promotion po
   WHERE po.kind IN ('item', 'bxgy') AND po.trigger = 'automatic' AND po.audience = 'everyone'
     AND po.published_at IS NOT NULL AND po.archived_at IS NULL
     AND public.promotion_state(po.id, ${at}) = 'active'
     AND EXISTS (
       SELECT 1 FROM public.promotion_target t
        WHERE t.promotion_id = po.id AND (
              t.product_id = ${product}.id
           OR (t.brand IS NOT NULL AND ${product}.brand IS NOT NULL AND lower(btrim(t.brand)) = lower(btrim(${product}.brand)))
           OR (t.category_id IS NOT NULL AND t.category_id IN (
                 WITH RECURSIVE up AS (
                   SELECT c.id, c.parent_id FROM public.category c WHERE c.id = ${product}.primary_category_id
                   UNION ALL
                   SELECT c.id, c.parent_id FROM public.category c JOIN up ON c.id = up.parent_id
                 ) SELECT up.id FROM up))))
   ORDER BY po.created_at LIMIT 1)`;

/** The row `PRODUCT_OFFER_SQL` yields. */
export interface ProductOfferRow {
  id: string;
  kind: "item" | "bxgy";
  valueType: "percent" | "amount" | "free";
  percentOff: number | null;
  amountOff: number | null;
  buy: number | null;
  get: number | null;
  label: string | null;
}

/** The badge for a product's offer — the promotion's own label, or the one composer's words. */
export function productOffer(row: ProductOfferRow | null | undefined): ProductOfferDTO | null {
  if (!row) return null;
  const label =
    row.label ??
    offerLabelOf({
      kind: row.kind,
      valueType: row.valueType,
      percentOff: row.percentOff === null ? null : Number(row.percentOff),
      amountOffCents: row.amountOff === null ? null : Math.round(Number(row.amountOff) * 100),
      maxDiscountCents: null,
      bxgy: row.buy && row.get ? { buy: row.buy, get: row.get, maxPerOrder: null } : null,
      covers: null,
      deliveryTypes: ["effy", "courier"],
      audience: "everyone",
      minSubtotalCents: 0,
      minQuantity: null,
      daysOfWeek: null,
      minuteFrom: null,
      minuteTo: null,
      maxUsesPerCustomer: null,
    });
  return { promotionId: row.id, label };
}
