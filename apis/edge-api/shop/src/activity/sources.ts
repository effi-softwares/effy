// The shop's activity logs (104): its team's activity and one order's activity, read through the activity helper.
// ⚠ A shop sees only its own shop's entries, and Effy's people only as "Effy" (FR-006): no source here names
// back-office staff, and every row is scoped by the actor's shop.
import { ACTIVITY_ACTOR_WORDS, REFUND_REASON_WORDS } from "@effy/shared-types";
import { activityFact, activityFactNumber, query, type ActivityRow, type ActivitySource } from "@effy/edge-shared";
import { lineNameSql, variantLabelSql } from "@effy/edge-shared/catalog";

import type { Actor } from "../fulfillments/service";
import { FulfillmentError } from "../fulfillments/types";
import { readActivitySql, type ActivityRecord } from "../orders/repository";
import { toEntry } from "../orders/service";

// ---- the team's activity --------------------------------------------------------------------------------

const STATE_WORDS: Record<string, string> = {
  received: "Opened",
  picking: "Started picking",
  ready_for_pickup: "Finished picking",
  collected: "Handed over",
  delivered: "Delivered",
  unfulfillable: "Marked can't supply",
  withdrawn: "Withdrew",
};

const STOCK_REASON_WORDS: Record<string, string> = {
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

const TEAM_WORDS: Record<string, string> = {
  state_changed: Object.values(STATE_WORDS).join(" "),
  item_gathered: "Picked",
  item_unavailable: "Marked unavailable",
  item_restored: "Restored",
  note_added: "Added a note",
  tags_changed: "Changed the tags",
  stock_changed: Object.values(STOCK_REASON_WORDS).join(" "),
  refund_issued: "Issued a refund",
};

const TEAM_KIND = `CASE t.action
  WHEN 'state_changed' THEN 'orders'
  WHEN 'note_added' THEN 'notes' WHEN 'tags_changed' THEN 'notes'
  WHEN 'stock_changed' THEN 'stock' WHEN 'refund_issued' THEN 'refund'
  ELSE 'picking' END`;

function teamEntry(r: ActivityRow) {
  const order = activityFact(r, "orderNumber");
  const product = activityFact(r, "product");
  const qty = activityFactNumber(r, "quantity") ?? 0;
  const actor = r.actor ?? (r.facts?.wasStaff === true ? ACTIVITY_ACTOR_WORDS.formerTeam : ACTIVITY_ACTOR_WORDS.effy);
  switch (r.action) {
    case "state_changed": {
      const to = activityFact(r, "reason") ?? "";
      return { title: STATE_WORDS[to] ?? "Updated", subject: order, actor, tone: to === "unfulfillable" || to === "withdrawn" ? ("problem" as const) : ("done" as const) };
    }
    case "item_gathered":
      return { title: `Picked ${qty} × ${product ?? "an item"}`, subject: order, actor, tone: "done" as const };
    case "item_unavailable":
      return { title: `Marked ${qty} × ${product ?? "an item"} unavailable`, subject: order, actor, tone: "problem" as const };
    case "item_restored":
      return { title: `Restored ${product ?? "an item"}`, subject: order, actor };
    case "note_added":
      return { title: "Added a note", subject: order, actor };
    case "tags_changed":
      return { title: "Changed the tags", subject: order, actor };
    case "stock_changed": {
      const reason = activityFact(r, "reason") ?? "";
      return {
        title: `${STOCK_REASON_WORDS[reason] ?? reason} ${qty > 0 ? `+${qty}` : qty}`,
        subject: product,
        actor,
      };
    }
    case "refund_issued":
      return {
        title: `Issued a refund of $${activityFact(r, "amount") ?? "0.00"}`,
        detail: (REFUND_REASON_WORDS as Record<string, string>)[activityFact(r, "reason") ?? ""] ?? activityFact(r, "reason"),
        subject: order,
        actor,
        tone: "problem" as const,
      };
    default:
      return { title: "Updated", actor };
  }
}

/**
 * Everything recorded against this shop: a union over `fulfillment_event`, `stock_movement` and `refund`, never a
 * log of its own. `actor` is the shop's own staff name or NULL; `wasStaff` says whether a person here acted.
 */
export function teamActivitySource(shopId: string): ActivitySource {
  return {
    sql: `
      SELECT t.id, t.at, ${TEAM_KIND} AS kind, t.action, t.actor, t.search_text, t.facts FROM (
        SELECT 'fe-' || fe.id::text AS id, fe.occurred_at AS at, fe.event_type AS action, ss.name AS actor,
               concat_ws(' ', o.order_number, oi.product_name, oi.variant_label) AS search_text,
               jsonb_build_object('orderNumber', o.order_number, 'quantity', fe.quantity, 'reason', fe.to_status, 'wasStaff', true,
                 'product', CASE WHEN oi.variant_label IS NULL THEN oi.product_name ELSE oi.product_name || ' — ' || oi.variant_label END) AS facts
          FROM public.fulfillment_event fe
          JOIN public.shop_fulfillment sf ON sf.id = fe.shop_fulfillment_id
          JOIN public."order" o           ON o.id = sf.order_id
          LEFT JOIN public.shop_staff ss  ON ss.id = fe.actor_staff_id
          LEFT JOIN public.order_item oi  ON oi.id = fe.order_item_id
         WHERE sf.shop_id = $1::uuid
        UNION ALL
        SELECT 'sm-' || sm.id::text, sm.created_at, 'stock_changed', ss.name,
               concat_ws(' ', ${lineNameSql("p.name", variantLabelSql("v"))}, sm.reason),
               jsonb_build_object('product', ${lineNameSql("p.name", variantLabelSql("v"))}, 'quantity', sm.quantity_delta,
                 'reason', sm.reason, 'wasStaff', sm.actor_kind = 'shop')
          FROM public.stock_movement sm
          JOIN public.product p          ON p.id = sm.product_id
          JOIN public.product_variant v  ON v.id = sm.variant_id
          LEFT JOIN public.shop_staff ss ON ss.cognito_sub = sm.actor_sub AND ss.shop_id = sm.shop_id
         WHERE sm.shop_id = $1::uuid
        UNION ALL
        -- ⚠ Only refunds the SHOP itself issued. A back-office refund on the same order is Effy's action and is
        -- not this roster's business; the order's own activity log carries it either way.
        SELECT 'rf-' || r.id::text, r.created_at, 'refund_issued', ss.name,
               concat_ws(' ', o.order_number, r.reason),
               jsonb_build_object('orderNumber', o.order_number, 'amount', r.amount::text, 'reason', r.reason, 'wasStaff', true)
          FROM public.refund r
          JOIN public."order" o ON o.id = r.order_id
          LEFT JOIN public.shop_staff ss ON ss.cognito_sub = r.actor_sub AND ss.shop_id = $1::uuid
         WHERE r.actor_kind = 'shop'
           AND EXISTS (SELECT 1 FROM public.shop_fulfillment sf2 WHERE sf2.order_id = r.order_id AND sf2.shop_id = $1::uuid)
      ) t`,
    args: [shopId],
    actionWords: TEAM_WORDS,
    entry: teamEntry,
  };
}

// ---- one order's activity -------------------------------------------------------------------------------

const ORDER_WORDS: Record<string, string> = {
  "event.state_changed": "Order opened acknowledged picking reopened marked received ready for pickup collected delivered can't supply cancelled",
  "event.item_gathered": "picked in full picking cleared",
  "event.item_unavailable": "marked unavailable",
  "event.item_restored": "found, no longer unavailable",
  "event.note_added": "Internal note added",
  "event.tags_changed": "Tags set to Tags cleared",
  refund: "Refund Cancellation refund",
  arrival: "Delivered to the customer",
};

const ORDER_KIND = `CASE
  WHEN log.source = 'refund' THEN 'refund'
  WHEN log.source = 'arrival' THEN 'delivery'
  WHEN log.event_type = 'state_changed' THEN 'status'
  WHEN log.event_type IN ('note_added', 'tags_changed') THEN 'notes'
  ELSE 'picking' END`;

const TONE = { negative: "problem", strong: "primary", quiet: "default" } as const;

function orderEntry(r: ActivityRow) {
  // The order console's own words (`toEntry`), from the record the log's SQL carries whole.
  const rec = { ...(r.facts as unknown as ActivityRecord), at: r.at };
  const e = toEntry(rec);
  return { title: e.title, actor: e.actorLabel, tone: TONE[e.tone] };
}

/** The portion's log; refused as not found when the portion is not this shop's. */
export async function orderActivitySource(actor: Actor, fulfillmentId: string): Promise<ActivitySource> {
  const owned = await query<{ id: string }>(
    `SELECT id FROM public.shop_fulfillment WHERE id = $1::uuid AND shop_id = $2::uuid`,
    [fulfillmentId, actor.shopId],
  );
  if (!owned.rows[0]) throw new FulfillmentError("not_found", "order not found");
  return {
    sql: `
      SELECT log.source || ':' || log.id AS id, log.at, ${ORDER_KIND} AS kind,
             CASE WHEN log.source = 'event' THEN 'event.' || log.event_type ELSE log.source END AS action,
             log.actor_name AS actor,
             concat_ws(' ', log.item_name, log.detail, log.to_status, log.amount) AS search_text,
             to_jsonb(log) - 'at' AS facts
        FROM (${readActivitySql}) log`,
    args: [fulfillmentId, actor.shopId],
    actionWords: ORDER_WORDS,
    entry: orderEntry,
  };
}
