// 113 US5: the clean-ups' activity log (104 drawer): every run, every late-payment refund, every settings change (the
// abandon time; 114's stock hold time).
// Read only. A run's words come from HOUSEKEEPING_JOBS, so the page and the log say it the same way.
import { activityFact, activityFactNumber, staffNameSql, type ActivityRow, type ActivitySource } from "@effy/edge-shared"
import { abandonWords, housekeepingJob, runWords, type HousekeepingJob } from "@effy/shared-types"

const OUTCOME_WORDS: Record<string, string> = { ok: "worked", partial: "partly worked", failed: "failed" }

function entry(r: ActivityRow) {
  if (r.kind === "settings") {
    const from = activityFactNumber(r, "from")
    const to = activityFactNumber(r, "to")
    // 114: how long checkout holds stock.
    if (r.action === "stockHoldMinutes") {
      return {
        title: "Stock hold time changed",
        detail: `Changed how long checkout holds stock from ${from ?? "?"} to ${to ?? "?"} minutes`,
      }
    }
    return {
      title: "Abandon time changed",
      detail: `${from === null ? "?" : abandonWords(from)} → ${to === null ? "?" : abandonWords(to)}`,
    }
  }
  if (r.kind === "refund") {
    return {
      title: `Refunded $${activityFact(r, "amount") ?? "?"} paid after order ${activityFact(r, "order") ?? "?"} was closed`,
      subject: activityFact(r, "order"),
      tone: "problem" as const,
    }
  }
  const job = r.action as HousekeepingJob
  const counts = (r.facts?.counts ?? {}) as Record<string, number>
  return {
    title: `${housekeepingJob(job).title} ${OUTCOME_WORDS[r.kind] ?? r.kind}`,
    detail: [runWords(job, counts), activityFact(r, "problem")].filter(Boolean).join(" · "),
    tone: r.kind === "ok" ? ("done" as const) : ("problem" as const),
  }
}

export function housekeepingActivitySource(): ActivitySource {
  return {
    sql: `
      SELECT 'run:' || r.id::text AS id, r.started_at AS at, r.outcome AS kind, r.job AS action, NULL::text AS actor,
             concat_ws(' ', r.job, r.problem) AS search_text,
             jsonb_build_object('counts', r.counts, 'problem', r.problem) AS facts
        FROM public.housekeeping_run r
      UNION ALL
      SELECT 'rf:' || f.id::text, f.created_at, 'refund', 'late_refund', NULL::text,
             o.order_number,
             jsonb_build_object('order', o.order_number, 'amount', f.amount::text)
        FROM public.refund f JOIN public."order" o ON o.id = f.order_id
       WHERE f.kind = 'unplaced'
      UNION ALL
      SELECT 'set:' || c.id::text, c.changed_at, 'settings', c.field, ${staffNameSql("c.changed_by")},
             concat_ws(' ', c.old_value, c.new_value),
             jsonb_build_object('from', c.old_value, 'to', c.new_value)
        FROM public.housekeeping_settings_change c`,
    args: [],
    actionWords: {
      unpaid_orders: "Unpaid orders",
      account_erasure: "Account erasure",
      phone_registrations: "Phone registrations",
      late_refund: "Refunded",
      abandonAfterMinutes: "Abandon time changed",
      stockHoldMinutes: "Stock hold time changed",
    },
    entry,
  }
}
