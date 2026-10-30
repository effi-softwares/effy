import { useState } from "react"
import { Check, CircleAlert, CircleCheck, Package, Snowflake, Thermometer, type LucideIcon } from "lucide-react"

import { STORAGE_CLASSES, STORAGE_CLASS_WORDS, type StorageClass } from "@effy/shared-types"
import { Button } from "@effy/design-system/ui"
import { ActionBarButton, useActionBar } from "@effy/web-kit/action-bar"
import { ScanField } from "@effy/web-kit/scanner"

import { canPick, pickModeOf, pickToast, type OrderDetail, type OrderLine, type PickMode } from "../orderConsole"
import { useSetPicks } from "../queries"
import { AdjustLineDialog } from "./AdjustLineDialog"
import { LineRow } from "./PickLine"
import { Shipments } from "./Shipments"

/**
 * The pick list, in walking order (099): tick a line as it goes in the bag, scan a barcode to tick it, or adjust a
 * line that is short. Marking it ready is the page's (the action bar's Mark ready opens the hand-over check).
 */
export function ItemsAndFulfilment({ detail }: { detail: OrderDetail }) {
  const picks = useSetPicks(detail.id)
  const [adjusting, setAdjusting] = useState<{ line: OrderLine; preset?: Exclude<PickMode, "none"> } | null>(null)
  const [scan, setScan] = useState<{ ok: boolean; text: string; lineId?: string } | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const editable = canPick(detail.status)
  const modes = detail.lines.map((l) => pickModeOf(l))
  const allPicked = detail.lines.length > 0 && modes.every((m) => m === "full")
  const pickedFull = modes.filter((m) => m === "full").length
  const shortCount = modes.filter((m) => m === "part" || m === "unavailable").length
  const done = modes.filter((m) => m !== "none").length
  const busy = picks.isPending
  const zones = zonesOf(detail.lines)
  // The next line to pick, in walking order.
  const next = editable ? zones.flatMap((z) => z.lines).find((l) => pickModeOf(l) === "none") : undefined

  function setLine(l: OrderLine, mode: PickMode) {
    if (!editable || busy) return
    picks.mutate({
      lines: [{ orderItemId: l.orderItemId, mode }],
      toast: pickToast(l.name, mode, l.orderedQuantity, l.orderedQuantity),
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

  // Several lines at once: all picked, or none of them to be had (each still says it on its own row).
  function markSelected(mode: "full" | "unavailable") {
    const lines = detail.lines.filter((l) => selected.has(l.orderItemId))
    const what = `${lines.length} ${lines.length === 1 ? "line" : "lines"}`
    picks.mutate(
      {
        lines: lines.map((l) => ({ orderItemId: l.orderItemId, mode })),
        toast: mode === "full" ? `${what} picked` : `${what} marked unavailable`,
      },
      { onSuccess: () => setSelected(new Set()) },
    )
  }

  // Ticked lines take the action bar while they are ticked, as a table's selection does.
  const bar = useActionBar({
    count: selected.size,
    label: "Selected lines",
    busy,
    onClear: () => setSelected(new Set()),
    children: (
      <>
        <ActionBarButton onClick={() => markSelected("full")}>
          <Check aria-hidden="true" />
          Mark picked
        </ActionBarButton>
        <ActionBarButton onClick={() => markSelected("unavailable")}>Can&apos;t supply them</ActionBarButton>
      </>
    ),
  })

  function onScan(raw: string) {
    const code = raw.trim()
    const l = detail.lines.find((x) => x.gtin === code || x.variantCode === code || x.sku === code)
    if (!l) {
      setScan({ ok: false, text: "That item isn't on this order - check the shelf." })
      return
    }
    setScan({ ok: true, text: `${l.name}${l.variantLabel ? ` · ${l.variantLabel}` : ""}`, lineId: l.orderItemId })
    if (pickModeOf(l) !== "full") setLine(l, "full")
  }

  const n = detail.lines.length
  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div aria-hidden="true" className="flex h-1.5 w-full max-w-80 overflow-hidden rounded-full bg-muted">
          <i
            className="block h-full bg-success transition-[width] duration-500"
            style={{ width: `${n ? (pickedFull / n) * 100 : 0}%` }}
          />
          <i
            className="block h-full bg-accent2 transition-[width] duration-500"
            style={{ width: `${n ? (shortCount / n) * 100 : 0}%` }}
          />
        </div>
        <p className="text-[13px] text-muted-foreground tabular-nums">
          {done} of {n} {n === 1 ? "line" : "lines"}
          {shortCount > 0 ? ` · ${shortCount} short` : ""}
        </p>
        {editable ? (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={toggleAll} disabled={busy}>
            {allPicked ? "Clear all" : "Select all"}
          </Button>
        ) : null}
      </div>

      {editable ? (
        <div className="grid gap-2">
          <ScanField
            accept={(t) => /^\d{8,14}$/.test(t.trim())}
            onRead={({ raw }) => onScan(raw)}
            placeholder="Scan a product barcode, or type it"
            label="Scan a product barcode"
          />
          {scan ? (
            <p role="status" className="flex items-center gap-2 text-sm font-medium [&_svg]:size-4">
              {scan.ok ? (
                <CircleCheck aria-hidden="true" className="text-success" />
              ) : (
                <CircleAlert aria-hidden="true" />
              )}
              {scan.text}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              A scanner types here. It ticks the line when the barcode matches.
            </p>
          )}
        </div>
      ) : null}

      <div className="grid gap-7">
        {zones.map(({ zone, lines }) => {
          const Z = ZONE[zone]
          return (
            <section key={zone} aria-label={STORAGE_CLASS_WORDS[zone]} className="grid gap-2.5">
              <h3 className="flex items-center gap-2.5 text-[13.5px]">
                <span
                  aria-hidden="true"
                  className="grid size-7 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-3.5"
                >
                  <Z.icon />
                </span>
                <span className="font-semibold">{STORAGE_CLASS_WORDS[zone]}</span>
                <span className="text-[12.5px] text-muted-foreground">· {Z.hint}</span>
              </h3>
              <ul className="m-0 grid list-none gap-2 p-0">
                {lines.map((l) => (
                  <LineRow
                    key={l.orderItemId}
                    line={l}
                    editable={editable}
                    busy={busy}
                    scanned={scan?.lineId === l.orderItemId}
                    next={next?.orderItemId === l.orderItemId}
                    selected={selected.has(l.orderItemId)}
                    onSelect={() =>
                      setSelected((s) => {
                        const nx = new Set(s)
                        if (nx.has(l.orderItemId)) nx.delete(l.orderItemId)
                        else nx.add(l.orderItemId)
                        return nx
                      })
                    }
                    onPick={() => setLine(l, "full")}
                    onUndo={() => setLine(l, "none")}
                    onSome={() => setAdjusting({ line: l, preset: "part" })}
                    onCantSupply={() => setAdjusting({ line: l, preset: "unavailable" })}
                    onNote={() => setAdjusting({ line: l })}
                  />
                ))}
              </ul>
            </section>
          )
        })}
      </div>

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
      {bar}
    </div>
  )
}

const ZONE: Record<StorageClass, { icon: LucideIcon; hint: string }> = {
  ambient: { icon: Package, hint: "Pick first" },
  chilled: { icon: Thermometer, hint: "Pick after the shelves, straight into the chilled bag" },
  frozen: { icon: Snowflake, hint: "Pick last, straight into the frozen bag" },
}

function zonesOf(lines: readonly OrderLine[]): { zone: StorageClass; lines: OrderLine[] }[] {
  return STORAGE_CLASSES.map((zone) => ({
    zone,
    lines: lines.filter((l) => (l.storageClass ?? "ambient") === zone),
  })).filter((g) => g.lines.length > 0)
}
