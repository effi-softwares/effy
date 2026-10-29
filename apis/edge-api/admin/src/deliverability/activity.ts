// One address's email events (104): every send the platform heard back about, from `email_delivery_event`.
import { activityFact, type ActivityRow, type ActivitySource } from "@effy/edge-shared"

const WORDS: Record<string, string> = {
  delivery: "Delivered",
  delivery_delay: "Delivery delayed",
  bounce: "Bounced",
  complaint: "Marked as spam",
  reject: "Rejected before sending",
}

const KIND: Record<string, string> = {
  delivery: "delivery",
  delivery_delay: "delay",
  bounce: "bounce",
  complaint: "complaint",
  reject: "reject",
}

function entry(r: ActivityRow) {
  const sub = activityFact(r, "subType")
  const reason = activityFact(r, "reason")
  return {
    title: WORDS[r.action] ?? r.action,
    detail: [sub, reason].filter(Boolean).join(" · ") || null,
    subject: activityFact(r, "templateId"),
    tone: r.action === "delivery" ? ("done" as const) : r.action === "delivery_delay" ? ("default" as const) : ("problem" as const),
    actor: null,
  }
}

/** `address` is matched case-insensitively (citext), as the detail route matches it. */
export function emailActivitySource(address: string): ActivitySource {
  const kindSql = `CASE ev.event_type ${Object.entries(KIND)
    .map(([t, k]) => `WHEN '${t}' THEN '${k}'`)
    .join(" ")} ELSE 'delivery' END`
  return {
    sql: `
      SELECT ev.id::text AS id, ev.occurred_at AS at, ${kindSql} AS kind, ev.event_type AS action,
             NULL::text AS actor,
             concat_ws(' ', ev.sub_type, ev.reason, ev.template_id, ev.message_id) AS search_text,
             jsonb_build_object('subType', ev.sub_type, 'reason', ev.reason, 'templateId', ev.template_id) AS facts
        FROM public.email_delivery_event ev
       WHERE ev.address = $1::citext`,
    args: [address],
    actionWords: WORDS,
    entry,
  }
}
