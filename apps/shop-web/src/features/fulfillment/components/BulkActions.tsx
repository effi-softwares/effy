import { useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { toast } from "@effy/design-system/ui"

import { DesignSheet, SheetField } from "@/components/console/DesignSheet"
import { track } from "@/lib/telemetry"
import { cn } from "@/lib/utils"

import { bulkCandidates, summarise, withTag, type BulkOutcome } from "../bulk"
import { fulfillmentMutationError } from "../errorText"
import type { RequestableTransition } from "../model"
import type { OrderRow } from "../orderConsole"
import { invalidateOrders } from "../queries"
import { setOrderTags, transitionFulfillment } from "../repo"
import { CantSupplyDialog } from "./StateControl"

/**
 * The bulk bar — the design's `hasSel` strip: "N selected" · a rule · the actions · Clear on the right.
 *
 * ⚠ THE DESIGN'S "Mark packed / Mark shipped" ARE EFFY'S TWO FORWARD STEPS: "Start picking" and "Mark
 * ready". Each moves only the selected orders that are at the step before it — never a state forced
 * onto an order already past it. "Cancel orders" is the can't-supply declaration (a shop cannot cancel
 * a customer's order), confirmed in a sheet that names every order it will touch.
 *
 * ⚠ SEQUENTIAL, AND A FAILURE DOES NOT ABORT THE RUN — each portion is moved against the state the
 * server held when its turn came, and the toast names what refused.
 */
export function BulkActions({
  rows,
  selected,
  onClear,
  onExport,
}: {
  rows: readonly OrderRow[]
  selected: ReadonlySet<string>
  onClear: () => void
  onExport: (rows: readonly OrderRow[]) => void
}) {
  const queryClient = useQueryClient()
  const [running, setRunning] = useState(false)
  const [tagOpen, setTagOpen] = useState(false)
  const [tag, setTag] = useState("")
  const [cancelOpen, setCancelOpen] = useState(false)

  const candidates = bulkCandidates(rows, selected)
  const chosen = rows.filter((r) => selected.has(r.id))
  const toPicking = candidates.filter((c) => c.to === "picking")
  const toReady = candidates.filter((c) => c.to === "ready_for_pickup")

  async function advance(to: RequestableTransition) {
    const batch = candidates.filter((c) => c.to === to)
    setRunning(true)
    const outcome: BulkOutcome = { succeeded: [], failed: [], skipped: selected.size - batch.length }
    for (const c of batch) {
      const from = rows.find((r) => r.id === c.id)?.status ?? "received"
      try {
        await transitionFulfillment(c.id, { to: c.to })
        outcome.succeeded.push(c.orderNumber)
        track({ name: "shop_order_state_changed", fulfillmentId: c.id, from, to: c.to })
      } catch (err) {
        outcome.failed.push({ orderNumber: c.orderNumber, reason: fulfillmentMutationError(err) })
      }
    }
    invalidateOrders(queryClient)
    setRunning(false)
    const message = summarise(outcome)
    if (outcome.failed.length === 0 && outcome.succeeded.length > 0) toast.success(message)
    else toast.error(message)
    if (outcome.failed.length === 0) onClear()
  }

  async function addTag() {
    const writes = withTag(rows, selected, tag)
    setRunning(true)
    const failed: string[] = []
    for (const w of writes) {
      try {
        await setOrderTags(w.id, w.tags)
      } catch {
        failed.push(w.orderNumber)
      }
    }
    invalidateOrders(queryClient)
    setRunning(false)
    const done = writes.length - failed.length
    if (done > 0) toast.success(`Tagged ${done} order${done === 1 ? "" : "s"} “${tag.trim().toLowerCase()}”`)
    if (writes.length === 0) toast.message("Every selected order already has that tag.")
    if (failed.length > 0) toast.error(`Couldn't tag ${failed.join(", ")}`)
    setTag("")
    setTagOpen(false)
  }

  return (
    <div className="border-border bg-muted flex flex-wrap items-center gap-2.5 rounded-[var(--radius)] border px-3.5 py-2.5">
      <div className="text-[13px] font-medium whitespace-nowrap tabular-nums">
        {selected.size} selected
      </div>
      <div aria-hidden="true" className="bg-border h-4 w-px" />
      <div className="flex flex-wrap gap-1.5">
        <BarButton disabled={running || toPicking.length === 0} onClick={() => void advance("picking")}>
          Start picking
        </BarButton>
        <BarButton disabled={running || toReady.length === 0} onClick={() => void advance("ready_for_pickup")}>
          Mark ready
        </BarButton>
        <BarButton disabled={running} onClick={() => setTagOpen(true)}>
          Add tag
        </BarButton>
        <BarButton disabled={running} onClick={() => onExport(chosen)}>
          Export
        </BarButton>
        <BarButton disabled={running} destructive onClick={() => setCancelOpen(true)}>
          Can&apos;t supply
        </BarButton>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        disabled={running}
        onClick={onClear}
        className="text-muted-foreground hover:text-foreground h-7 cursor-pointer rounded-md border-none bg-transparent px-2.5 text-[12.5px] font-medium whitespace-nowrap"
      >
        Clear
      </button>

      <DesignSheet
        open={tagOpen}
        onOpenChange={setTagOpen}
        title="Tag selected orders"
        description="The tag is added to every order you picked."
        saveLabel="Add tag"
        canSave={tag.trim() !== ""}
        saving={running}
        onSave={() => void addTag()}
      >
        <SheetField label="Add a tag" htmlFor="bulk-tag">
          <input
            id="bulk-tag"
            autoFocus
            maxLength={32}
            placeholder="Fragile"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tag.trim()) void addTag()
            }}
            className="border-input bg-background focus:border-ring h-9 rounded-md border px-3 text-sm outline-none"
          />
        </SheetField>
      </DesignSheet>

      <CantSupplyDialog targets={chosen} open={cancelOpen} onOpenChange={setCancelOpen} onDone={onClear} />
    </div>
  )
}

/** The bar's buttons: 28px, outline on the background, 12.5px — the destructive one in red. */
function BarButton({
  children,
  onClick,
  disabled,
  destructive,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "border-input bg-background h-7 cursor-pointer rounded-md border px-2.5 text-[12.5px] font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50",
        destructive ? "text-destructive hover:bg-destructive/10" : "hover:bg-accent",
      )}
    >
      {children}
    </button>
  )
}
