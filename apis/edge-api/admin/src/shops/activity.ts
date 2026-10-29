// A shop's activity (104): every change to the shop and its team, from `admin.audit_log`.
import { activityFact, actionFallback, staffNameSql, type ActivityRow, type ActivitySource } from "@effy/edge-shared";

const WORDS: Record<string, string> = {
  "shop.create": "Shop created",
  "shop.update": "Shop details edited",
  "shop.status_change": "Status changed",
  "shop.delete": "Shop removed",
  "shop.pack_scanning_changed": "Pack scanning changed",
  "shop_user.provision": "Team member added",
  "shop_user.role_change": "Team member's role changed",
  "shop_user.status_change": "Team member's access changed",
};

const ROLE_WORDS: Record<string, string> = { shop_manager: "Manager", shop_staff: "Staff" };

function entry(r: ActivityRow) {
  const title = WORDS[r.action] ?? actionFallback(r.action);
  const member = activityFact(r, "member");
  switch (r.action) {
    case "shop.create":
      return { title, detail: activityFact(r, "code") ? `Code ${activityFact(r, "code")}` : null, tone: "done" as const };
    case "shop.update":
      return { title, detail: activityFact(r, "name") };
    case "shop.status_change": {
      const to = activityFact(r, "to");
      return { title, detail: `${activityFact(r, "from") ?? "?"} → ${to ?? "?"}`, tone: to === "active" ? ("primary" as const) : ("problem" as const) };
    }
    case "shop.delete":
      return { title, tone: "problem" as const };
    case "shop.pack_scanning_changed": {
      const values = r.facts?.values as { packScanRequired?: unknown } | undefined;
      return { title, detail: values?.packScanRequired === true ? "Every bag must be scanned" : "Scanning is optional" };
    }
    case "shop_user.provision":
    case "shop_user.role_change": {
      const role = activityFact(r, "role");
      return { title, detail: [member, role ? (ROLE_WORDS[role] ?? role) : null].filter(Boolean).join(" · ") || null };
    }
    case "shop_user.status_change":
      return { title, detail: [member, activityFact(r, "status")].filter(Boolean).join(" · ") || null };
    default:
      return { title };
  }
}

export function shopActivitySource(shopId: string): ActivitySource {
  return {
    sql: `
      SELECT a.id::text AS id, a.created_at AS at,
             CASE WHEN a.target_type = 'shop_staff' THEN 'team'
                  WHEN a.action IN ('shop.status_change', 'shop.delete') THEN 'status'
                  ELSE 'shop' END AS kind,
             a.action,
             ${staffNameSql("a.actor_sub")} AS actor,
             concat_ws(' ', a.detail::text, ss.name, ss.email) AS search_text,
             a.detail || jsonb_build_object('member', COALESCE(ss.name, ss.email)) AS facts
        FROM admin.audit_log a
        LEFT JOIN public.shop_staff ss ON a.target_type = 'shop_staff' AND ss.id = a.target_id
       WHERE (a.target_type = 'shop' AND a.target_id = $1::uuid)
          OR (a.target_type = 'shop_staff'
              AND a.target_id IN (SELECT id FROM public.shop_staff WHERE shop_id = $1::uuid))`,
    args: [shopId],
    actionWords: WORDS,
    entry,
  };
}
