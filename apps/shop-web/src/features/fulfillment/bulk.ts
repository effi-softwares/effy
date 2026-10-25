import { type FulfillmentStatus, type RequestableTransition, nextTransition } from "./model"

interface BulkRow {
  id: string
  orderNumber: string
  status: FulfillmentStatus
}

interface BulkCandidate {
  id: string
  orderNumber: string
  to: RequestableTransition
}

export function bulkCandidates(rows: readonly BulkRow[], selectedIds: ReadonlySet<string>): BulkCandidate[] {
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
  failed: { orderNumber: string; reason: string }[]
  skipped: number
}

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

  if (parts.length === 0) return "Nothing to advance."
  return parts.join(" · ") + "."
}

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
