// 113: the account-erasure clean-up (hourly). For each closure whose date has passed: the provider's customer record,
// then the sign-in, then one transaction that erases the rest (repository.ts). A failing step leaves the account
// `closing`, counts it `retried` and says which step failed; the next run picks it up again (FR-017).
//
// ⚠ Known window (research R7): when the sign-in is deleted and the transaction then fails, the email is free in
// Cognito but still on the `closing` row, so a new registration with it fails until the next run (an hour at most).
// Accepted rather than inverting the order, which would need a second marker for a committed tombstone with a live
// Cognito user.
import {
  emitMetric,
  HOUSEKEEPING_METRIC_NAMESPACE,
  logger,
  problemOf,
  recordRun,
  withTransaction,
  type RunResult,
  type Transactor,
} from "@effy/edge-shared"

import type { Fingerprints } from "./fingerprint"
import { fingerprintsOf } from "./fingerprint"
import { claimDue, eraseCustomer, scrubFinishedOrders, type DueClosure } from "./repository"

/** About 600 a day: far above dev's and launch volumes; a backlog takes more runs, never a longer one. */
export const ERASURE_BATCH = 25
const STOP_WITH_MS_LEFT = 20_000

export interface ErasureDeps {
  transact?: Transactor
  deleteProviderCustomer: (providerCustomerId: string) => Promise<void>
  deleteSignIn: (sub: string) => Promise<void>
  deleteLabel: (key: string) => Promise<void>
  /** The fingerprint key, or null (no fingerprints are kept, and that is logged). */
  fingerprintKey: () => Promise<string | null>
  now?: () => Date
  /** Milliseconds this invocation has left. */
  timeLeft?: () => number

}

export async function runErasure(deps: ErasureDeps): Promise<RunResult> {
  const transact = deps.transact ?? withTransaction
  const now = deps.now ?? (() => new Date())
  const timeLeft = deps.timeLeft ?? (() => Number.POSITIVE_INFINITY)

  const counts = { erased: 0, retried: 0, pointsForfeited: 0, ordersScrubbedLater: 0 }
  const problems: string[] = []
  const labels: string[] = []

  // The claim is only a snapshot of who is due: each account is erased in its own transaction below, and the claim
  // query's own conditions are checked again there (a restore since then simply matches nothing).
  const due = await transact((tx) => claimDue(tx, ERASURE_BATCH))
  let key: string | null | undefined

  for (const c of due) {
    if (timeLeft() < STOP_WITH_MS_LEFT) break
    let step = "provider"
    try {
      if (c.providerCustomerId) await deps.deleteProviderCustomer(c.providerCustomerId)
      step = "sign-in"
      await deps.deleteSignIn(c.sub)
      step = "database"
      if (c.barred && key === undefined) {
        // An unseeded key must not stop an erasure the customer was promised: erase without the fingerprint, and say so.
        try {
          key = await deps.fingerprintKey()
        } catch (err) {
          key = null
          problems.push(problemOf("fingerprint key", err))
        }
      }
      const fingerprints: Fingerprints | null = c.barred && key ? fingerprintsOf(c.email, c.phone, key) : null
      if (c.barred && !key) logger.warn({ customerId: c.customerId }, "erasure: barred account erased without a fingerprint key")
      const out = await transact(async (tx) => {
        const still = await claimOne(tx, c)
        if (!still) return null
        return eraseCustomer(tx, c, now(), fingerprints)
      })
      if (out) {
        counts.erased += 1
        counts.pointsForfeited += out.pointsForfeited
        labels.push(...out.labelKeys)
      }
    } catch (err) {
      counts.retried += 1
      problems.push(problemOf(step, err))
      logger.warn({ customerId: c.customerId, step, err: (err as Error)?.name }, "erasure: account left for the next run")
    }
  }

  // Orders that were on their way at erasure and have finished since.
  if (timeLeft() >= STOP_WITH_MS_LEFT) {
    try {
      const later = await transact((tx) => scrubFinishedOrders(tx))
      counts.ordersScrubbedLater = later.orders
      labels.push(...later.labelKeys)
    } catch (err) {
      problems.push(problemOf("finished orders", err))
    }
  }

  // Label files go after their commits: a deleted file with a rolled-back row would point at nothing.
  for (const k of labels) {
    try {
      await deps.deleteLabel(k)
    } catch (err) {
      problems.push(problemOf("label file", err))
    }
  }

  const ns = HOUSEKEEPING_METRIC_NAMESPACE
  if (counts.erased > 0) emitMetric(ns, "AccountsErased", counts.erased)
  if (counts.retried > 0) emitMetric(ns, "AccountErasureRetried", counts.retried)
  return { counts, problems }
}

/** Re-checks, under its own transaction's lock, that this closure is still due and not restored. */
async function claimOne(tx: Parameters<Parameters<Transactor>[0]>[0], c: DueClosure): Promise<boolean> {
  const r = await tx.query(
    `SELECT 1 FROM public.customer_closure_request r JOIN public.customer cu ON cu.id = r.customer_id
      WHERE r.id = $1 AND r.cancelled_at IS NULL AND r.erased_at IS NULL AND r.erase_after <= now()
        AND cu.closure_state = 'closing'
      FOR UPDATE OF r, cu`,
    [c.requestId],
  )
  return (r.rowCount ?? 0) > 0
}

/** The scheduled entry: the run is recorded whatever happens. */
export function accountErasure(deps: ErasureDeps): Promise<RunResult> {
  return recordRun("account_erasure", () => runErasure(deps))
}
