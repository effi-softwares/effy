// A promotion's activity (104): every staff change to it, from `admin.audit_log`.
import { activityFact, activityFactNumber, actionFallback, staffNameSql, type ActivityRow, type ActivitySource } from "@effy/edge-shared";

import { PromoError } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WORDS: Record<string, string> = {
  "promotion.created": "Promotion created",
  "promotion.updated": "Promotion edited",
  "promotion.deleted": "Promotion deleted",
  "promotion.publish": "Published",
  "promotion.pause": "Paused",
  "promotion.resume": "Resumed",
  "promotion.end": "Ended",
  "promotion.archive": "Archived",
  "promotion.image_added": "Picture added",
  "promotion.image_updated": "Picture changed",
  "promotion.image_removed": "Picture removed",
  "promotion.customers_added": "Customers added",
  "promotion.customer_removed": "Customer removed",
  "promotion_code.batch_generated": "Single-use codes made",
};

const KIND_SQL = `CASE
  WHEN a.action IN ('promotion.publish', 'promotion.pause', 'promotion.resume', 'promotion.end', 'promotion.archive') THEN 'status'
  WHEN a.action LIKE 'promotion.image_%' THEN 'pictures'
  WHEN a.action LIKE 'promotion.customer%' THEN 'audience'
  WHEN a.action LIKE 'promotion_code.%' THEN 'codes'
  ELSE 'promotion' END`;

function entry(r: ActivityRow) {
  const title = WORDS[r.action] ?? actionFallback(r.action);
  switch (r.action) {
    case "promotion.created":
    case "promotion.publish":
    case "promotion.resume":
      return { title, tone: "primary" as const };
    case "promotion.deleted":
    case "promotion.end":
    case "promotion.archive":
      return { title, tone: "problem" as const };
    case "promotion.updated": {
      const changed = Array.isArray(r.facts?.changed) ? (r.facts.changed as unknown[]).filter((c) => typeof c === "string") : [];
      return { title, detail: changed.length > 0 ? `Changed: ${changed.join(", ")}` : null };
    }
    case "promotion.image_added":
      return { title, detail: activityFact(r, "alt") };
    case "promotion.customers_added": {
      const added = activityFactNumber(r, "added") ?? 0;
      const unknown = activityFactNumber(r, "unknown") ?? 0;
      return { title, detail: `${added} added${unknown > 0 ? ` · ${unknown} not found` : ""}` };
    }
    case "promotion_code.batch_generated":
      return { title, detail: `${activityFactNumber(r, "created") ?? 0} codes` };
    default:
      return { title };
  }
}

export function promotionActivitySource(id: string): ActivitySource {
  if (!UUID.test(id)) throw new PromoError(404, "not_found", "promotion not found");
  return {
    sql: `
      SELECT a.id::text AS id, a.created_at AS at, ${KIND_SQL} AS kind, a.action,
             ${staffNameSql("a.actor_sub")} AS actor,
             a.detail::text AS search_text,
             a.detail AS facts
        FROM admin.audit_log a
       WHERE a.target_type = 'promotion' AND a.target_id = $1::uuid`,
    args: [id],
    actionWords: WORDS,
    entry,
  };
}
