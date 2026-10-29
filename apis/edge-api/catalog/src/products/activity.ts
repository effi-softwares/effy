// A product's activity in back-office (104): Effy's decisions on it from `admin.audit_log`, and the shop's
// creation of it (not audited by staff; it is the product's own first fact).
import { activityFact, actionFallback, staffNameSql, type ActivityRow, type ActivitySource } from "@effy/edge-shared";

import { requireProductId } from "./service";

const WORDS: Record<string, string> = {
  "product.created_by_shop": "Created by the shop",
  "product.approved": "Approved",
  "product.sent_back": "Sent back",
  "product.change_approved": "Change approved",
  "product.change_sent_back": "Change sent back",
  "product.margin_set": "Margin set",
  "catalog.placements_set": "Also-shown-in aisles set",
  "product.held": "Held",
  "product.released": "Released",
  "product.created_by_effy": "Created by Effy",
  "product.effy_edited": "Edited by Effy",
  "product.effy_completed": "Finished by Effy and put on sale",
  "product.variant_state_set": "Size on/off sale",
};

const KIND: Record<string, string> = {
  "product.approved": "review",
  "product.sent_back": "review",
  "product.change_approved": "review",
  "product.change_sent_back": "review",
  "product.margin_set": "margin",
  "product.held": "sale",
  "product.released": "sale",
  "product.variant_state_set": "sale",
};

function trimDecimal(v: string): string {
  return v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v;
}

const marginWords = (m: unknown): string | null => {
  if (!m || typeof m !== "object") return null;
  const { kind, value } = m as { kind?: unknown; value?: unknown };
  if (typeof value !== "string" && typeof value !== "number") return null;
  return kind === "percent" ? `${trimDecimal(String(value))}%` : `$${Number(value).toFixed(2)}`;
};

function entry(r: ActivityRow) {
  const title = WORDS[r.action] ?? actionFallback(r.action);
  switch (r.action) {
    case "product.sent_back":
    case "product.change_sent_back":
      return { title, detail: activityFact(r, "reason"), tone: "problem" as const };
    case "product.held":
      return { title, detail: activityFact(r, "reason"), tone: "problem" as const };
    case "product.approved":
    case "product.change_approved":
      return { title, detail: marginWords(r.facts?.marginAfter) ? `Margin ${marginWords(r.facts?.marginAfter)}` : null, tone: "done" as const };
    case "product.margin_set":
      return { title, detail: marginWords(r.facts?.marginAfter) };
    case "product.released": {
      const to = activityFact(r, "releasedTo");
      return { title, detail: to ? (to === "active" ? "Back on sale" : "Not on sale") : null, tone: "primary" as const };
    }
    case "product.variant_state_set": {
      const label = activityFact(r, "label");
      const to = activityFact(r, "to");
      const state = to ? (to === "active" ? "On sale" : "Off sale") : null;
      return { title, detail: [label, state].filter(Boolean).join(": ") || null };
    }
    case "product.effy_completed":
      return { title, tone: "done" as const };
    case "product.created_by_shop":
      return { title, actor: "Shop" };
    default:
      return { title };
  }
}

export function productActivitySource(rawProductId: string | undefined): ActivitySource {
  const productId = requireProductId(rawProductId);
  const kindSql = `CASE a.action ${Object.entries(KIND)
    .map(([a, k]) => `WHEN '${a}' THEN '${k}'`)
    .join(" ")} ELSE 'content' END`;
  return {
    sql: `
      SELECT a.id::text AS id, a.created_at AS at, ${kindSql} AS kind, a.action,
             ${staffNameSql("a.actor_sub")} AS actor,
             a.detail::text AS search_text,
             a.detail AS facts
        FROM admin.audit_log a
       WHERE a.target_type = 'product' AND a.target_id = $1::uuid
      UNION ALL
      SELECT 'created:' || p.id::text, p.created_at, 'content', 'product.created_by_shop',
             NULL::text, NULL::text, NULL::jsonb
        FROM public.product p
       WHERE p.id = $1::uuid AND p.created_via = 'shop'`,
    args: [productId],
    actionWords: WORDS,
    entry,
  };
}
