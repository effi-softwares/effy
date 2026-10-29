// A product's stock activity for its shop (104): every movement of every size, read through the activity
// helper; the drawer's Size filter (`sub`) narrows it to one size. ⚠ Effy's people are "Effy" here (FR-006).
import { ACTIVITY_ACTOR_WORDS } from "@effy/shared-types";
import { activityFact, activityFactNumber, query, type ActivityRequest, type ActivityRow, type ActivitySource } from "@effy/edge-shared";
import { variantLabelSql } from "@effy/edge-shared/catalog";

import { notFound, type Actor } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REASON_WORDS: Record<string, string> = {
  received: "Stock received",
  correction: "Correction",
  damage: "Damaged",
  expiry: "Expired",
  order_paid: "Sold",
  pick_shortfall: "Short at picking",
  refund: "Returned on a refund",
  tracking_enabled: "Tracking turned on",
  tracking_disabled: "Tracking turned off",
};

const KIND_SQL = `CASE m.reason
  WHEN 'received' THEN 'received'
  WHEN 'order_paid' THEN 'sold' WHEN 'refund' THEN 'sold'
  WHEN 'damage' THEN 'loss' WHEN 'expiry' THEN 'loss'
  WHEN 'tracking_enabled' THEN 'tracking' WHEN 'tracking_disabled' THEN 'tracking'
  ELSE 'correction' END`;

function entry(r: ActivityRow) {
  const delta = activityFactNumber(r, "delta") ?? 0;
  const before = activityFactNumber(r, "before");
  const after = activityFactNumber(r, "after");
  const order = activityFact(r, "orderNumber");
  return {
    title: `${REASON_WORDS[r.action] ?? r.action} ${delta > 0 ? `+${delta}` : delta}`,
    detail: [before !== null && after !== null ? `${before} → ${after}` : null, order ? `Order ${order}` : null, activityFact(r, "note")]
      .filter(Boolean)
      .join(" · ") || null,
    subject: activityFact(r, "size"),
    tone: delta < 0 && (r.action === "damage" || r.action === "expiry") ? ("problem" as const) : ("default" as const),
  };
}

/** Refused as not found when the product is not this shop's. */
export async function stockActivitySource(actor: Actor, productId: string, req: ActivityRequest): Promise<ActivitySource> {
  if (!UUID.test(productId)) throw notFound();
  const owned = await query<{ id: string }>(`SELECT id FROM public.product WHERE id = $1::uuid AND shop_id = $2::uuid`, [productId, actor.shopId]);
  if (!owned.rows[0]) throw notFound();
  const args: unknown[] = [productId, actor.shopId];
  let size = "";
  if (req.filters.sub) {
    args.push(req.filters.sub);
    size = `AND m.variant_id = $${args.length}::uuid`;
  }
  return {
    sql: `
      SELECT m.id::text AS id, m.created_at AS at, ${KIND_SQL} AS kind, m.reason AS action,
             CASE m.actor_kind
               WHEN 'shop' THEN COALESCE(ss.name, '${ACTIVITY_ACTOR_WORDS.formerTeam}')
               WHEN 'back_office' THEN '${ACTIVITY_ACTOR_WORDS.effy}'
               ELSE '${ACTIVITY_ACTOR_WORDS.system}' END AS actor,
             concat_ws(' ', ${variantLabelSql("v")}, o.order_number, m.note) AS search_text,
             jsonb_build_object('delta', m.quantity_delta, 'before', m.quantity_before, 'after', m.quantity_after,
                                'orderNumber', o.order_number, 'note', m.note, 'size', ${variantLabelSql("v")}) AS facts
        FROM public.stock_movement m
        JOIN public.product_variant v ON v.id = m.variant_id
        LEFT JOIN public.shop_staff ss ON ss.cognito_sub = m.actor_sub AND ss.shop_id = m.shop_id
        LEFT JOIN public."order" o ON o.id = m.order_id
       WHERE m.product_id = $1::uuid AND m.shop_id = $2::uuid ${size}`,
    args,
    actionWords: REASON_WORDS,
    entry,
  };
}
