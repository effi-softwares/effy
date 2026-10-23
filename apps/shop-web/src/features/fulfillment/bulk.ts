import type { FulfillmentStatus, RequestableTransition } from "./model"
import { nextTransition } from "./model"

/** What the bulk logic needs of a row — met by both the pick queue and the 057 A3 order list. */
export interface BulkRow {
  id: string
  orderNumber: string
  status: FulfillmentStatus
}

/**
 * Bulk state-advance, pure. Each portion advances to its own next state (`nextTransition`, as on the
 * single-order screen), never to one the operator picked, since a selection spans states. There is no bulk
 * endpoint: each portion goes through the per-portion route, where the state machine's guards live, and
 * the summary says honestly what failed.
 */

/** A portion that can be advanced, paired with the transition it would take. */
export interface BulkCandidate {
  id: string
  orderNumber: string
  to: RequestableTransition
}

/**
 * Only forward, never `unfulfillable`: declaring a portion unsuppliable tells Effy to refund a customer,
 * so it is its own control listing every order and demanding a reason (`CantSupplyDialog`).
 */
export function bulkCandidates(
  rows: readonly BulkRow[],
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

/** The sentence after a bulk run: a count with every failure named, never "done" when nothing moved. */
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

  // Every arm reachable: a selection of only-terminal rows produces the third part alone, and an
  // empty selection cannot reach here (the control is disabled). Never return "" — a silent control
  // is indistinguishable from a broken one.
  if (parts.length === 0) return "Nothing to advance."
  return parts.join(" · ") + "."
}

/**
 * The tag set each selected row should end with after "Add tag": its own tags plus the new
 * one. Per row, because the tag route takes an absolute set — sending just the new tag would erase
 * every tag the row already had. Rows that already carry it are left out, so nothing is re-written.
 */
export function withTag(
  rows: readonly (BulkRow & { tags: readonly string[] })[],
  selectedIds: ReadonlySet<string>,
  tag: string,
): { id: string; orderNumber: string; tags: string[] }[] {
  const t = tag.trim().toLowerCase()
  if (!t) return []
  return rows
    .filter((r) => selectedIds.has(r.id) && !r.tags.includes(t))
    .map((r) => ({ id: r.id, orderNumber: r.orderNumber, tags: [...r.tags, t] }))
}
