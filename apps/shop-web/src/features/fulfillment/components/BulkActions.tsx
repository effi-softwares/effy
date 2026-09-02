import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Loader2, X } from "lucide-react"

import { Button } from "@effy/design-system/ui"

import { track } from "@/lib/telemetry"

import { bulkCandidates, summarise, type BulkOutcome } from "../bulk"
import { fulfillmentMutationError } from "../errorText"
import type { FulfillmentSummary } from "../model"
import { transitionFulfillment } from "../repo"

/**
 * The bulk bar (US2, T027) — appears only when rows are selected.
 *
 * ⚠ IT RUNS THE TRANSITIONS SEQUENTIALLY, NOT IN PARALLEL. Parallel requests against the same queue
 * would race the server's own state guards and produce a wall of 409s that mean nothing to the
 * operator. Sequential is slower and honest: each portion is advanced against the state the server
 * actually held when its turn came.
 *
 * ⚠ A FAILURE DOES NOT ABORT THE RUN. Advancing eight orders and stopping at the third because one
 * refused would leave the operator with no idea which five were untouched. Every candidate is
 * attempted; the summary names what refused.
 */
export function BulkActions({
  rows,
  selected,
  onClear,
}: {
  rows: readonly FulfillmentSummary[]
  selected: ReadonlySet<string>
  onClear: () => void
}) {
  const queryClient = useQueryClient()
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)

  const candidates = bulkCandidates(rows, selected)
  const skipped = selected.size - candidates.length

  async function run() {
    setRunning(true)
    setSummary(null)
    const outcome: BulkOutcome = { succeeded: [], failed: [], skipped }

    for (const c of candidates) {
      try {
        await transitionFulfillment(c.id, { to: c.to })
        outcome.succeeded.push(c.orderNumber)
        track({ name: "shop_order_state_changed", fulfillmentId: c.id, from: "bulk", to: c.to })
      } catch (err) {
        outcome.failed.push({ orderNumber: c.orderNumber, reason: fulfillmentMutationError(err) })
      }
    }

    // One invalidation at the end, not one per order — the queue polls anyway, and N refetches
    // mid-run would repaint the table under the operator's hand.
    await queryClient.invalidateQueries({ queryKey: ["shop", "fulfillment", "queue"] })
    setSummary(summarise(outcome))
    setRunning(false)
    if (outcome.failed.length === 0) onClear()
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border px-4 py-3">
      <span className="text-sm font-medium tabular-nums">
        {selected.size} selected
      </span>

      <Button size="sm" disabled={running || candidates.length === 0} onClick={() => void run()}>
        {running ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
        {running ? "Advancing…" : `Advance ${candidates.length}`}
      </Button>

      <Button variant="ghost" size="sm" disabled={running} onClick={onClear}>
        <X />
        Clear
      </Button>

      {/* ⚠ The disabled reason is SAID, not left to be inferred from a greyed button. A control that
          refuses without explanation is indistinguishable from one that is broken. */}
      {candidates.length === 0 && selected.size > 0 ? (
        <span className="text-muted-foreground text-sm">
          Nothing selected can be advanced — these orders are already finished.
        </span>
      ) : null}

      {summary ? (
        <span role="status" className="text-sm">
          {summary}
        </span>
      ) : null}
    </div>
  )
}
