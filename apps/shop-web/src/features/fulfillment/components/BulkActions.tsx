import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Loader2, Tag } from "lucide-react"

import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toast,
} from "@effy/design-system/ui"

import { track } from "@/lib/telemetry"

import { bulkCandidates, summarise, withTag, type BulkOutcome } from "../bulk"
import { fulfillmentMutationError } from "../errorText"
import type { OrderRow } from "../orderConsole"
import { invalidateOrders } from "../queries"
import { setOrderTags, transitionFulfillment } from "../repo"
import { CantSupplyDialog } from "./StateControl"

/**
 * The bulk bar (US2, T027; 057 A3's fulfil · tag · cancel · clear) — appears only when rows are
 * selected, and says how many.
 *
 * ⚠ IT RUNS SEQUENTIALLY, NOT IN PARALLEL. Parallel requests against the same queue would race the
 * server's own state guards and produce a wall of 409s that mean nothing to the operator. Sequential
 * is slower and honest: each portion is advanced against the state the server actually held when its
 * turn came.
 *
 * ⚠ A FAILURE DOES NOT ABORT THE RUN. Advancing eight orders and stopping at the third because one
 * refused would leave the operator with no idea which five were untouched. Every candidate is
 * attempted; the toast names what refused.
 */
export function BulkActions({
  rows,
  selected,
  onClear,
}: {
  rows: readonly OrderRow[]
  selected: ReadonlySet<string>
  onClear: () => void
}) {
  const queryClient = useQueryClient()
  const [running, setRunning] = useState<"advance" | "tag" | null>(null)
  const [tagOpen, setTagOpen] = useState(false)
  const [tag, setTag] = useState("")
  const [cancelOpen, setCancelOpen] = useState(false)

  const candidates = bulkCandidates(rows, selected)
  const skipped = selected.size - candidates.length
  const chosen = rows.filter((r) => selected.has(r.id))

  async function advance() {
    setRunning("advance")
    const outcome: BulkOutcome = { succeeded: [], failed: [], skipped }
    for (const c of candidates) {
      const from = rows.find((r) => r.id === c.id)?.status ?? "received"
      try {
        await transitionFulfillment(c.id, { to: c.to })
        outcome.succeeded.push(c.orderNumber)
        track({ name: "shop_order_state_changed", fulfillmentId: c.id, from, to: c.to })
      } catch (err) {
        outcome.failed.push({ orderNumber: c.orderNumber, reason: fulfillmentMutationError(err) })
      }
    }
    // One invalidation at the end, not one per order — N refetches mid-run would repaint the table
    // under the operator's hand.
    invalidateOrders(queryClient)
    setRunning(null)
    const message = summarise(outcome)
    if (outcome.failed.length === 0 && outcome.succeeded.length > 0) toast.success(message)
    else toast.error(message)
    if (outcome.failed.length === 0) onClear()
  }

  async function addTag() {
    const writes = withTag(rows, selected, tag)
    setRunning("tag")
    const failed: string[] = []
    for (const w of writes) {
      try {
        await setOrderTags(w.id, w.tags)
      } catch {
        failed.push(w.orderNumber)
      }
    }
    invalidateOrders(queryClient)
    setRunning(null)
    const done = writes.length - failed.length
    if (done > 0) toast.success(`Tagged ${done} order${done === 1 ? "" : "s"} “${tag.trim().toLowerCase()}”`)
    if (writes.length === 0) toast.message("Every selected order already has that tag.")
    if (failed.length > 0) toast.error(`Couldn't tag ${failed.join(", ")}`)
    setTag("")
    setTagOpen(false)
  }

  const busy = running !== null

  return (
    <div className="border-border bg-muted flex flex-wrap items-center gap-2.5 rounded-[var(--radius)] border px-3.5 py-2.5">
      <span className="text-[13px] font-medium whitespace-nowrap tabular-nums">
        {selected.size} selected
      </span>
      <span aria-hidden="true" className="bg-border h-4 w-px" />

      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[12.5px]"
          disabled={busy || candidates.length === 0}
          title={candidates.length === 0 ? "Nothing selected can be advanced — already finished" : undefined}
          onClick={() => void advance()}
        >
          {running === "advance" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
          Fulfil {candidates.length > 0 ? candidates.length : ""}
        </Button>

        <Popover open={tagOpen} onOpenChange={setTagOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-[12.5px]" disabled={busy}>
              {running === "tag" ? <Loader2 className="animate-spin" /> : <Tag />}
              Add tag
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64">
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (tag.trim()) void addTag()
              }}
            >
              <label htmlFor="bulk-tag" className="text-[13px] font-medium">
                Tag {selected.size} order{selected.size === 1 ? "" : "s"}
              </label>
              <Input
                id="bulk-tag"
                autoFocus
                maxLength={32}
                placeholder="e.g. fragile"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
              <Button type="submit" size="sm" disabled={!tag.trim() || busy}>
                Add tag
              </Button>
            </form>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive h-7 text-[12.5px]"
          disabled={busy}
          onClick={() => setCancelOpen(true)}
        >
          Can&apos;t supply
        </Button>
      </div>

      <div className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground h-7 text-[12.5px]"
        disabled={busy}
        onClick={onClear}
      >
        Clear selection
      </Button>

      <CantSupplyDialog
        targets={chosen}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onDone={onClear}
      />
    </div>
  )
}
