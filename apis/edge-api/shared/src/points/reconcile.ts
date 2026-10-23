/**
 * Does the ledger still add up? The balance is derived, so what can go wrong is rows disagreeing: a lot
 * over-allocated, a debit whose allocations differ from it, a negative usable balance, or a hold still
 * `held` on an order no longer pending.
 */
import type { Queryable } from "../lib/db";
import { emitMetric } from "../lib/metrics";

/** The money namespace, watched by infra/envs/dev/commerce-alarms.tf. */
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

/** Checks the ledger and reports the count every run, zero included, so the alarm has data. */
export async function reportLedger(q: Queryable, now: Date): Promise<LedgerCheck> {
  const check = await checkLedger(q, now);
  emitMetric(POINTS_METRIC_NAMESPACE, "PointsInvariantViolations", check.violations);
  return check;
}
