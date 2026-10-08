/**
 * Does the ledger still add up? (074 SC-001, SC-002; quickstart P15)
 *
 * The balance is derived, so there is no stored figure to disagree with the rows — what CAN go wrong is
 * the rows disagreeing with each other. Each of these is impossible through @effy/edge-shared/points;
 * this is what notices a write that did not go through it, or a bug in it.
 *
 *   · a lot allocated beyond its points            (points spent that were never there)
 *   · a debit whose allocations do not equal it    (a debit that took the wrong amount)
 *   · a customer whose usable balance is negative
 *   · a hold still `held` on an order that is no longer pending
 *
 * ⚠ The count is emitted EVERY run, zero included, so the alarm has data when all is well.
 */
import type { Queryable } from "../lib/db";
import { emitMetric } from "../lib/metrics";

/**
 * Points metrics have ONE namespace whichever service emits them — the money namespace the alarms in
 * infra/envs/dev/commerce-alarms.tf watch (the rule `payments/index.ts` records for refunds).
 */
export const POINTS_METRIC_NAMESPACE = "Effy/Commerce";

export interface LedgerCheck {
  overAllocatedLots: number;
  unbalancedDebits: number;
  negativeBalances: number;
  strandedHolds: number;
  violations: number;
}

export async function checkLedger(q: Queryable, now: Date): Promise<LedgerCheck> {
  const row = (
    await q.query<{ over_allocated: string; unbalanced: string; negative: string; stranded: string }>(
      `
SELECT
  (SELECT count(*) FROM public.points_entry e
    WHERE e.points > 0
      AND e.points < COALESCE((SELECT SUM(a.points) FROM public.points_allocation a WHERE a.credit_entry_id = e.id), 0)) AS over_allocated,
  (SELECT count(*) FROM public.points_entry e
    WHERE e.points < 0
      AND -e.points <> COALESCE((SELECT SUM(a.points) FROM public.points_allocation a WHERE a.debit_entry_id = e.id), 0)) AS unbalanced,
  (SELECT count(*) FROM public.points_account pa WHERE public.points_usable(pa.customer_id, $1) < 0) AS negative,
  (SELECT count(*) FROM public.points_hold h JOIN public."order" o ON o.id = h.order_id
    WHERE h.state = 'held' AND o.status <> 'pending_payment') AS stranded`,
      [now],
    )
  ).rows[0]!;
  const out = {
    overAllocatedLots: Number(row.over_allocated), unbalancedDebits: Number(row.unbalanced),
    negativeBalances: Number(row.negative), strandedHolds: Number(row.stranded),
  };
  return { ...out, violations: out.overAllocatedLots + out.unbalancedDebits + out.negativeBalances + out.strandedHolds };
}

/** Check the ledger and REPORT the count — every run, zero included, so the alarm always has data. */
export async function reportLedger(q: Queryable, now: Date): Promise<LedgerCheck> {
  const check = await checkLedger(q, now);
  emitMetric(POINTS_METRIC_NAMESPACE, "PointsInvariantViolations", check.violations);
  return check;
}
