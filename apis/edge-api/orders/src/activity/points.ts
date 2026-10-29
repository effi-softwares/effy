// A customer's points (104) and the points rules' changes, as activity logs. Read only: the ledger's one writer
// is `@effy/edge-shared/points`; the words staff read here are not the customer's (`customerWords`).
import { POINTS_REASON_LABELS } from "@effy/shared-types";
import { activityFact, activityFactNumber, staffNameSql, type ActivityRow, type ActivitySource } from "@effy/edge-shared";

const ENTRY_WORDS: Record<string, string> = {
  staff_credit: "Points added",
  auto_credit: "Points added automatically",
  returned: "Points returned by a refund",
  staff_debit: "Points taken off",
  spent: "Points spent on an order",
  expired: "Points expired",
  forfeited: "Points forfeited — account closed",
};

const FLOW_WORDS: Record<string, string> = {
  refund: "Refund",
  points_expiry: "Expiry",
  account_closure: "Account closure",
  courier_override: "Courier override",
};

const FLOW_SQL = Object.entries(FLOW_WORDS)
  .map(([flow, w]) => `WHEN '${flow}' THEN '${w}'`)
  .join(" ");

const KIND_SQL = `CASE e.kind
  WHEN 'staff_credit' THEN 'credit' WHEN 'auto_credit' THEN 'credit' WHEN 'returned' THEN 'credit'
  WHEN 'spent' THEN 'spent' WHEN 'staff_debit' THEN 'debit' ELSE 'expired' END`;

function pointsEntry(r: ActivityRow) {
  const points = activityFactNumber(r, "points") ?? 0;
  const reason = activityFact(r, "reason");
  const fixed = reason === r.action;
  return {
    title: `${ENTRY_WORDS[r.action] ?? r.action}: ${points > 0 ? "+" : ""}${points.toLocaleString("en-AU")}`,
    detail: [!fixed && reason ? (POINTS_REASON_LABELS[reason] ?? reason) : null, activityFact(r, "note")].filter(Boolean).join(" — ") || null,
    subject: activityFact(r, "orderNumber"),
    tone: points > 0 ? ("done" as const) : r.action === "staff_debit" ? ("problem" as const) : ("default" as const),
  };
}

export function pointsActivitySource(customerId: string): ActivitySource {
  return {
    sql: `
      SELECT e.id::text AS id, e.created_at AS at, ${KIND_SQL} AS kind, e.kind AS action,
             CASE e.author_kind WHEN 'customer' THEN 'Customer'
                  WHEN 'system' THEN COALESCE(CASE e.author_flow ${FLOW_SQL} END, 'System')
                  ELSE ${staffNameSql("e.author_sub")} END AS actor,
             concat_ws(' ', e.reason, e.note, o.order_number) AS search_text,
             jsonb_build_object('points', e.points, 'reason', e.reason, 'note', e.note, 'orderNumber', o.order_number) AS facts
        FROM public.points_entry e
        LEFT JOIN public."order" o ON o.id = e.order_id
       WHERE e.customer_id = $1::uuid`,
    args: [customerId],
    actionWords: ENTRY_WORDS,
    entry: pointsEntry,
  };
}

/** The rules' names, as the settings form labels them. */
const FIELD_WORDS: Record<string, string> = {
  centsPerPoint: "Value of a point (cents)",
  expiryMonths: "Points last (months)",
  csaCreditLimitPoints: "Customer-service credit limit",
  warningDays: "Expiry warning (days before)",
  holdMinutes: "Checkout hold (minutes)",
};

function settingsEntry(r: ActivityRow) {
  return {
    title: `${FIELD_WORDS[r.action] ?? r.action} changed`,
    detail: `${activityFact(r, "from") ?? "?"} → ${activityFact(r, "to") ?? "?"}`,
  };
}

export function pointsSettingsActivitySource(): ActivitySource {
  return {
    sql: `
      SELECT c.id::text AS id, c.changed_at AS at, 'rules'::text AS kind, c.field AS action,
             ${staffNameSql("c.changed_by")} AS actor,
             concat_ws(' ', c.old_value, c.new_value) AS search_text,
             jsonb_build_object('from', c.old_value, 'to', c.new_value) AS facts
        FROM public.points_settings_change c`,
    args: [],
    actionWords: Object.fromEntries(Object.entries(FIELD_WORDS).map(([k, w]) => [k, `${w} changed`])),
    entry: settingsEntry,
  };
}
