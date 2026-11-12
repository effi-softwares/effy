// 113: the unpaid-orders clean-up (every 15 minutes). An order still awaiting payment after the abandon time is closed
// through `abandonOrder` (@effy/edge-shared/payments), which cancels the payment at the provider first and only then
// frees the points, promotion uses and delivery place. A payment that went through is placed instead; one still being
// made, or a provider that can't be asked, is left for the next run (FR-002).
import {
  emitMetric,
  HOUSEKEEPING_METRIC_NAMESPACE,
  pooled,
  problemOf,
  readAbandonAfterMinutes,
  recordRun,
  type Queryable,
  type RunResult,
} from "@effy/edge-shared"
import { announceOrder } from "@effy/edge-shared/live"
import { abandonOrder, type AbandonDeps } from "@effy/edge-shared/payments"
import { announcePoints } from "@effy/edge-shared/points"

/** A provider call each (8 s timeout): 50 fits a 120 s function with room to spare. The rest wait for the next run. */
export const UNPAID_BATCH = 50
const STOP_WITH_MS_LEFT = 15_000

export interface UnpaidDeps extends Pick<AbandonDeps, "gateway" | "settlePaid" | "transact"> {
  q?: Queryable
  now?: () => Date
  timeLeft?: () => number
  /** After each close commits: the order's own audience, and the customer's points when they moved. */
  announceClosed?: (orderId: string, pointsSub: string | null) => Promise<void>
}

const announceClosedOrder = async (orderId: string, pointsSub: string | null): Promise<void> => {
  // A never-paid order has no packages, so only the customer and operations hear of it.
  await announceOrder(orderId, { shops: false })
  if (pointsSub) await announcePoints([pointsSub])
}

export async function runUnpaidOrders(deps: UnpaidDeps): Promise<RunResult> {
  const q = deps.q ?? pooled
  const now = deps.now ?? (() => new Date())
  const timeLeft = deps.timeLeft ?? (() => Number.POSITIVE_INFINITY)
  const tell = deps.announceClosed ?? announceClosedOrder

  const counts = { closed: 0, stillPaying: 0, paidLate: 0, unreachable: 0, lateRefunds: 0 }
  const problems: string[] = []

  const abandonMin = await readAbandonAfterMinutes(q)
  // "Last touched" is updated_at: every payment-intent call rewrites the order (FR-006).
  const due = (
    await q.query<{ id: string }>(
      `SELECT o.id::text AS id FROM public."order" o
        WHERE o.status = 'pending_payment' AND o.updated_at < $1::timestamptz - ($2 || ' minutes')::interval
        ORDER BY o.updated_at
        LIMIT $3`,
      [now(), String(abandonMin), UNPAID_BATCH],
    )
  ).rows

  for (const o of due) {
    if (timeLeft() < STOP_WITH_MS_LEFT) break
    try {
      const r = await abandonOrder({ gateway: deps.gateway, settlePaid: deps.settlePaid, transact: deps.transact, q, now }, o.id)
      if (r.result === "abandoned") {
        counts.closed += 1
        await tell(o.id, r.outcome?.pointsReleased ? (r.outcome.customerSub ?? null) : null)
      } else if (r.result === "paid") counts.paidLate += 1
      else if (r.result === "in_progress") counts.stillPaying += 1
      else if (r.result === "unreachable") counts.unreachable += 1
    } catch (err) {
      problems.push(problemOf("close order", err))
    }
  }
  if (counts.unreachable > 0) problems.push("provider: payments couldn't be checked")

  // Late payments refunded since the previous run (the webhook records them; this run reports them).
  const late = (
    await q.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.refund r
        WHERE r.kind = 'unplaced'
          AND r.created_at >= COALESCE((SELECT max(started_at) FROM public.housekeeping_run WHERE job = 'unpaid_orders'), '-infinity')`,
    )
  ).rows[0]
  counts.lateRefunds = late?.n ?? 0

  if (counts.closed > 0) emitMetric(HOUSEKEEPING_METRIC_NAMESPACE, "UnpaidOrdersClosed", counts.closed)
  if (counts.stillPaying > 0) emitMetric(HOUSEKEEPING_METRIC_NAMESPACE, "UnpaidOrdersStillPaying", counts.stillPaying)
  return { counts, problems }
}

/** The scheduled entry: the run is recorded whatever happens. */
export function unpaidOrders(deps: UnpaidDeps): Promise<RunResult> {
  return recordRun("unpaid_orders", () => runUnpaidOrders(deps))
}
