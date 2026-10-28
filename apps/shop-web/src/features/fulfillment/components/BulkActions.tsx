import { useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { X } from "lucide-react"

import { Button, Input, Separator, toast } from "@effy/design-system/ui"

import { DesignSheet, SheetField } from "@/components/console/DesignSheet"
import { track } from "@/lib/telemetry"

import { bulkCandidates, summarise, withTag, type BulkOutcome } from "../bulk"
import { fulfillmentMutationError } from "../errorText"
import type { RequestableTransition } from "../model"
import type { OrderRow } from "../orderConsole"
import { invalidateOrders } from "../queries"
import { getOrder, recordParcelPrints, setOrderTags, transitionFulfillment } from "../repo"
import { printLabels, rememberedLayout, type PrintJob } from "../labels/printer"
import { CantSupplyDialog } from "./StateControl"

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

  async function printSelected() {
    setRunning(true)
    try {
      const jobs: PrintJob[] = []
      const failed: string[] = []
      for (const r of chosen) {
        try {
          const d = await getOrder(r.id)
          jobs.push({ common: d.labelCommon, parcels: d.parcels })
        } catch {
          failed.push(r.orderNumber)
        }
      }
      const layout = rememberedLayout()
      const out = await printLabels(jobs, layout, recordParcelPrints)
      invalidateOrders(queryClient)
      if (!out.ok) {
        toast.error(out.detail)
        return
      }
      track({ name: "labels_printed", orders: jobs.length, count: out.printed, layout, path: out.path })
      toast.success(
        `${out.printed} label${out.printed === 1 ? "" : "s"} for ${jobs.length} order${jobs.length === 1 ? "" : "s"} sent to the printer`,
      )
      if (failed.length > 0) toast.error(`Couldn't read ${failed.join(", ")} — print those from the order.`)
    } finally {
      setRunning(false)
    }
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
    <div
      role="region"
      aria-label="Selected orders"
      className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 rounded-xl border bg-popover py-2 pr-2 pl-4 text-sm font-medium text-popover-foreground shadow-lg max-[1099px]:bottom-[calc(80px+env(safe-area-inset-bottom))]"
    >
      <div className="whitespace-nowrap tabular-nums">{selected.size} selected</div>
      <Separator orientation="vertical" className="data-[orientation=vertical]:h-5" />
      <div className="flex flex-wrap gap-2">
        <BarButton disabled={running || toPicking.length === 0} onClick={() => void advance("picking")}>
          Start picking
        </BarButton>
        <BarButton disabled={running || toReady.length === 0} onClick={() => void advance("ready_for_pickup")}>
          Mark ready
        </BarButton>
        <BarButton disabled={running || chosen.length === 0} onClick={() => void printSelected()}>
          Print labels
        </BarButton>
        <BarButton disabled={running} onClick={() => setTagOpen(true)}>
          Add tag
        </BarButton>
        <BarButton disabled={running} onClick={() => onExport(chosen)}>
          Export
        </BarButton>
        <BarButton disabled={running} onClick={() => setCancelOpen(true)}>
          Can&apos;t supply
        </BarButton>
      </div>
      <Separator orientation="vertical" className="data-[orientation=vertical]:h-5" />
      <Button type="button" variant="ghost" size="sm" disabled={running} onClick={onClear}>
        Clear
        <X aria-hidden="true" />
      </Button>

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
          <Input
            id="bulk-tag"
            autoFocus
            maxLength={32}
            placeholder="Fragile"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tag.trim()) void addTag()
            }}
          />
        </SheetField>
      </DesignSheet>

      <CantSupplyDialog targets={chosen} open={cancelOpen} onOpenChange={setCancelOpen} onDone={onClear} />
    </div>
  )
}

function BarButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  )
}
