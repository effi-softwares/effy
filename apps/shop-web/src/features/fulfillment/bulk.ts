import type { FulfillmentSummary, RequestableTransition } from "./model"
import { nextTransition } from "./model"

/**
 * Bulk state-advance (US2, T027) — pure logic, no React, unit-testable.
 *
 * ⚠ IT ADVANCES EACH PORTION TO ITS OWN NEXT STATE, NEVER TO A STATE THE OPERATOR PICKED. A selection
 * legitimately spans states — three orders waiting to be started and two mid-pick — and a control that
 * said "set all to picking" would either refuse the mixed selection or force a state onto a portion
 * that was already past it. Each row's next step is derived from what the server last said about THAT
 * row, using the same `nextTransition` the single-order screen uses, so the bulk path and the single
 * path cannot disagree about what "advance" means.
 *
 * ⚠ THERE IS NO BULK ENDPOINT, AND THAT IS DELIBERATE. Each portion transitions through the existing
 * per-portion route, which is the only place the state machine's guards live. A bulk route would be a
 * second implementation of those guards — the shape 055's own post-mortem warns about — and it would
 * have to invent an answer for "half of them failed", which the summary below gives honestly instead.
 */

/** A portion that can be advanced, paired with the transition it would take. */
export interface BulkCandidate {
  id: string
  orderNumber: string
  to: RequestableTransition
}

/**
 * ⚠ ONLY FORWARD, AND NEVER `unfulfillable`. `nextTransition` returns the one forward step; declaring
 * a portion unsuppliable is a separate, reason-carrying decision that tells Effy to refund a customer
 * (055 FR-031). Offering it in a bulk control — where one click covers rows the operator did not read
 * individually — is how a mis-click refunds five people.
 */
export function bulkCandidates(
  rows: readonly FulfillmentSummary[],
  selectedIds: ReadonlySet<string>,
): BulkCandidate[] {
  const out: BulkCandidate[] = []
  for (const row of rows) {
    if (!selectedIds.has(row.id)) continue
    const to = nextTransition(row.status)
    if (to === null || to === "unfulfillable") continue
    out.push({ id: row.id, orderNumber: row.orderNumber, to })
  }
  return out
}

export interface BulkOutcome {
  succeeded: string[]
  /** Order numbers that refused, with the reason as the server gave it. */
  failed: { orderNumber: string; reason: string }[]
  /** Selected rows that had no forward step at all — already finished, or terminal. */
  skipped: number
}

/**
 * The sentence shown after a bulk run (FR-011).
 *
 * ⚠ IT REPORTS A COUNT, NOT A CLAIM OF SUCCESS. 033 shipped "0 items added to your cart" while every
 * item had failed for a reason the shopper was never told; the lesson is that a summary which counts
 * without naming leaves the operator unable to act. So failures are NAMED, and the message never says
 * "done" when nothing moved.
 */
export function summarise(outcome: BulkOutcome): string {
  const { succeeded, failed, skipped } = outcome
  const parts: string[] = []

  if (succeeded.length > 0) {
    parts.push(`${succeeded.length} order${succeeded.length === 1 ? "" : "s"} advanced`)
  }
  if (failed.length > 0) {
    const names = failed.map((f) => f.orderNumber).join(", ")
    parts.push(`${failed.length} refused (${names})`)
  }
  if (skipped > 0) {
    parts.push(`${skipped} had nothing to advance`)
  }

  // ⚠ Every arm reachable: a selection of only-terminal rows produces the third part alone, and an
  // empty selection cannot reach here (the control is disabled). Never return "" — a silent control
  // is indistinguishable from a broken one.
  if (parts.length === 0) return "Nothing to advance."
  return parts.join(" · ") + "."
}
