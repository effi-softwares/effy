import { useState } from "react"
import { CircleAlert, CircleCheck, Package, Snowflake, Thermometer, type LucideIcon } from "lucide-react"

import { STORAGE_CLASSES, STORAGE_CLASS_WORDS, type StorageClass } from "@effy/shared-types"
import { Button, toast } from "@effy/design-system/ui"
import { ScanField } from "@effy/web-kit/scanner"

import {
  canPick,
  deliveredByText,
  formatMoney,
  pickModeOf,
  pickSummary,
  pickToast,
  type OrderDetail,
  type OrderLine,
  type PickMode,
} from "../orderConsole"
import { useSetPicks } from "../queries"
import { AdjustLineDialog } from "./AdjustLineDialog"
import { FulfilDialog } from "./FulfilDialog"
import { RefundedBox, TotalRow } from "./OrderTotals"
import { LineRow } from "./PickLine"
import { Shipments } from "./Shipments"

export function ItemsAndFulfilment({ detail }: { detail: OrderDetail }) {
  const picks = useSetPicks(detail.id)
  const [adjusting, setAdjusting] = useState<{ line: OrderLine; preset?: Exclude<PickMode, "none"> } | null>(null)
  const [fulfilOpen, setFulfilOpen] = useState(false)
  const [scan, setScan] = useState<{ ok: boolean; text: string; lineId?: string } | null>(null)

  const editable = canPick(detail.status)
  const modes = detail.lines.map((l) => pickModeOf(l))
  const allPicked = detail.lines.length > 0 && modes.every((m) => m === "full")
  const pickedFull = modes.filter((m) => m === "full").length
  const pickedAny = modes.some((m) => m === "full" || m === "part")
  const busy = picks.isPending

  function toggleLine(l: OrderLine) {
    if (!editable || busy) return
    const next: PickMode = pickModeOf(l) === "full" ? "none" : "full"
    picks.mutate({
      lines: [{ orderItemId: l.orderItemId, mode: next }],
      toast: pickToast(l.name, next, l.orderedQuantity, l.orderedQuantity),
    })
  }

  function toggleAll() {
    if (!editable || busy) return
    const mode: PickMode = allPicked ? "none" : "full"
    picks.mutate({
      lines: detail.lines.map((l) => ({ orderItemId: l.orderItemId, mode })),
      toast: allPicked ? "Picking cleared on every item" : "Every item picked",
    })
  }

  function onScan(raw: string) {
    const code = raw.trim()
    const l = detail.lines.find((x) => x.gtin === code || x.variantCode === code || x.sku === code)
    if (!l) {
      setScan({ ok: false, text: "That item isn't on this order — check the shelf." })
      return
    }
    setScan({ ok: true, text: `${l.name}${l.variantLabel ? ` · ${l.variantLabel}` : ""}`, lineId: l.orderItemId })
    if (pickModeOf(l) !== "full" && editable && !busy) {
      picks.mutate({
        lines: [{ orderItemId: l.orderItemId, mode: "full" }],
        toast: pickToast(l.name, "full", l.orderedQuantity, l.orderedQuantity),
      })
    }
  }

  function fulfil() {
    if (!pickedAny) {
      toast("Tick at least one item first")
      return
    }
    setFulfilOpen(true)
  }

  const m = detail.money
  const pct = detail.lines.length > 0 ? (pickedFull / detail.lines.length) * 100 : 0

  return (
    <section className="ef-panel min-w-0">
      <div className="ef-panel__head">
        <div className="grid min-w-0 flex-1 gap-2">
          <h2 className="ef-panel__title">Items and fulfilment</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="ef-meter ef-meter--lg w-full max-w-65" aria-hidden="true">
              <i className="ef-meter__booked" style={{ width: `${pct}%` }} />
            </div>
            <p className="ef-panel__desc">
              {pickSummary(detail.lines)} · {deliveredByText(detail.deliveredBy)}
            </p>
          </div>
        </div>
        {editable ? (
          <Button variant="ghost" onClick={toggleAll} disabled={busy}>
            {allPicked ? "Clear all" : "Select all"}
          </Button>
        ) : null}
      </div>

      {editable ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-b-border px-5 py-3 max-md:px-4">
          <div className="min-w-0 flex-1">
            <ScanField
              accept={(t) => /^\d{8,14}$/.test(t.trim())}
              onRead={({ raw }) => onScan(raw)}
              placeholder="Scan a product barcode, or type it"
              label="Scan a product barcode"
            />
          </div>
          {scan ? (
            <p role="status" className="scan__state basis-full">
              {scan.ok ? (
                <CircleCheck aria-hidden="true" className="text-success" />
              ) : (
                <CircleAlert aria-hidden="true" />
              )}
              {scan.text}
            </p>
          ) : (
            <p className="basis-full text-sm text-muted-foreground">
              A scanner types here. It ticks the line when the barcode matches.
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-col">
        {zonesOf(detail.lines).map(({ zone, lines }) => {
          const Z = ZONE[zone]
          return (
            <section key={zone} aria-label={STORAGE_CLASS_WORDS[zone]}>
              <h3 className="flex items-center gap-2 border-b border-b-border bg-muted/55 px-5 py-3 text-sm font-semibold tracking-[0.02em] max-md:px-4 max-md:py-3 [&_svg]:size-4">
                <Z.icon aria-hidden="true" />
                {STORAGE_CLASS_WORDS[zone].toUpperCase()}
                <span className="font-normal tracking-normal text-muted-foreground">· {Z.hint}</span>
              </h3>
              <ul>
                {lines.map((l) => (
                  <LineRow
                    key={l.orderItemId}
                    line={l}
                    currency={m.currency}
                    editable={editable}
                    busy={busy}
                    scanned={scan?.lineId === l.orderItemId}
                    onToggle={() => toggleLine(l)}
                    onAdjust={() => setAdjusting({ line: l })}
                    onCantFind={() => setAdjusting({ line: l, preset: "unavailable" })}
                  />
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <div className="border-t border-border px-5 py-3 max-md:px-4">
        <TotalRow label="Your items" value={formatMoney(m.shopSubtotal, m.currency)} />
        {Number(m.discount) > 0 ? (
          <TotalRow label="Discount" value={`−${formatMoney(m.discount, m.currency)}`} />
        ) : null}
        <TotalRow label="Total" value={formatMoney(m.total, m.currency)} strong />
        {detail.refunds.length > 0 ? <RefundedBox detail={detail} /> : null}
      </div>

      {editable ? (
        <div className="ef-panel__foot ef-panel__foot--between">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground text-pretty">
            {pickedAny
              ? "Marks everything ticked above ready for an Effy driver to collect."
              : "Tick the items you have picked, or use Adjust for part-picked and unavailable lines."}
          </p>
          <Button variant={pickedAny ? "default" : "secondary"} onClick={fulfil} aria-disabled={!pickedAny}>
            {pickedAny ? `Fulfil ${pickedFull} ${pickedFull === 1 ? "item" : "items"}` : "Fulfil picked items"}
          </Button>
        </div>
      ) : null}

      <Shipments detail={detail} />

      <AdjustLineDialog
        line={adjusting?.line ?? null}
        preset={adjusting?.preset}
        onClose={() => setAdjusting(null)}
        saving={busy}
        onSave={(mode, units, note) => {
          const l = adjusting!.line
          picks.mutate(
            {
              lines: [
                { orderItemId: l.orderItemId, mode, ...(mode === "part" ? { units } : {}), ...(note ? { note } : {}) },
              ],
              toast: pickToast(l.name, mode, units, l.orderedQuantity),
            },
            { onSuccess: () => setAdjusting(null) },
          )
        }}
      />
      <FulfilDialog detail={detail} open={fulfilOpen} onOpenChange={setFulfilOpen} />
    </section>
  )
}

const ZONE: Record<StorageClass, { icon: LucideIcon; hint: string }> = {
  ambient: { icon: Package, hint: "pick first" },
  chilled: { icon: Thermometer, hint: "then, straight into the chilled bag" },
  frozen: { icon: Snowflake, hint: "pick last, straight into the frozen bag" },
}

function zonesOf(lines: readonly OrderLine[]): { zone: StorageClass; lines: OrderLine[] }[] {
  return STORAGE_CLASSES.map((zone) => ({
    zone,
    lines: lines.filter((l) => (l.storageClass ?? "ambient") === zone),
  })).filter((g) => g.lines.length > 0)
}
