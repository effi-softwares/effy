import { useEffect, useState, type ReactNode } from "react"
import { Check, CircleAlert, CircleCheck, ImageOff, Minus, Package, Pencil, Plus, Snowflake, Thermometer, X, type LucideIcon } from "lucide-react"

import { STORAGE_CLASSES, STORAGE_CLASS_WORDS, type StorageClass } from "@effy/shared-types"

import { Button, Input, Textarea, toast } from "@effy/design-system/ui"
import { ScanField } from "@effy/web-kit/scanner"

import { ChoiceCards } from "@/components/console/ChoiceCards"

import { DesignSheet, SheetField } from "@/components/console/DesignSheet"
import { cn } from "@/lib/utils"

import {
  canPick,
  formatMoney,
  formatWhen,
  deliveredByText,
  pickLabel,
  pickModeOf,
  pickSummary,
  pickToast,
  unitsError,
  type OrderDetail,
  type OrderLine,
  type PickMode,
} from "../orderConsole"
import { useSetPicks, useTransitionFulfillment } from "../queries"
import { lineCodes } from "../codes";

/**
 * "Items and fulfilment" — the packing screen's pick list (Packing board 01). The priced lines ARE the
 * pick list: one tap on a line's 44px tick marks the whole line picked (again clears it); "Select all" /
 * "Clear all" does every line; part picked, can't find or a note go through the line's "Adjust" sheet. A
 * line's state is two absolute counts, one write per tap (`setPicks`). A product barcode — from a
 * hand scanner anywhere on the page, the camera or typed — ticks the line it belongs to.
 *
 * No "Edit order": an order is a paid record; an unsuppliable line is marked Unavailable and the money
 * follows by refund. No carrier or tracking fields; "Shipments" lists the hand-over.
 */
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

  /** A scanned or typed product code: it ticks its line, or says plainly that it is not on this order. */
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
    <section className="bo-panel min-w-0">
      <div className="bo-panel__head">
        <div className="grid min-w-0 flex-1 gap-2">
          <h2 className="bo-panel__title">Items and fulfilment</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="bo-meter bo-meter--lg w-full max-w-[260px]" aria-hidden="true">
              <i className="bo-meter__booked" style={{ width: `${pct}%` }} />
            </div>
            <p className="bo-panel__desc">
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
        <div className="sh-scan">
          <div className="min-w-0 flex-1">
            <ScanField
              accept={(t) => /^\d{8,14}$/.test(t.trim())}
              onRead={({ raw }) => onScan(raw)}
              placeholder="Scan a product barcode, or type it"
              label="Scan a product barcode"
            />
          </div>
          {scan ? (
            <p role="status" className="sh-scan__state basis-full">
              {scan.ok ? <CircleCheck aria-hidden="true" className="text-success" /> : <CircleAlert aria-hidden="true" />}
              {scan.text}
            </p>
          ) : (
            <p className="basis-full text-sm text-muted-foreground">A scanner types here. It ticks the line when the barcode matches.</p>
          )}
        </div>
      ) : null}

      {/* Walking order (099): shelves first, the fridge, the freezer last — cold goods out the least. */}
      <div className="sh-picklist">
        {zonesOf(detail.lines).map(({ zone, lines }) => {
          const Z = ZONE[zone]
          return (
            <section key={zone} aria-label={STORAGE_CLASS_WORDS[zone]}>
              <h3 className="sh-zone">
                <Z.icon aria-hidden="true" />
                {STORAGE_CLASS_WORDS[zone].toUpperCase()}
                <span className="sh-zone__hint">· {Z.hint}</span>
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
          // The total only; a shop is never told which promotion it was.
          <TotalRow label="Discount" value={`−${formatMoney(m.discount, m.currency)}`} />
        ) : null}
        {/* No delivery row. A shop never sees what the customer paid for delivery, nor other shops' items. */}
        <TotalRow label="Total" value={formatMoney(m.total, m.currency)} strong />
        {detail.refunds.length > 0 ? <RefundedBox detail={detail} /> : null}
      </div>

      {editable ? (
        <div className="bo-panel__foot bo-panel__foot--between">
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
              lines: [{ orderItemId: l.orderItemId, mode, ...(mode === "part" ? { units } : {}), ...(note ? { note } : {}) }],
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

// Walking order

const ZONE: Record<StorageClass, { icon: LucideIcon; hint: string }> = {
  ambient: { icon: Package, hint: "pick first" },
  chilled: { icon: Thermometer, hint: "then, straight into the chilled bag" },
  frozen: { icon: Snowflake, hint: "pick last, straight into the frozen bag" },
}

/** The order's lines grouped Ambient → Chilled → Frozen, keeping their order within a group; no empty groups. */
export function zonesOf(lines: readonly OrderLine[]): { zone: StorageClass; lines: OrderLine[] }[] {
  return STORAGE_CLASSES.map((zone) => ({ zone, lines: lines.filter((l) => (l.storageClass ?? "ambient") === zone) })).filter(
    (g) => g.lines.length > 0,
  )
}

// A line

/**
 * The line's tick: 44px, four states by fill, border and glyph — picked ✓ on blue · part – on the blue
 * tint · can't find × dashed in the foreground · not yet empty. The status word beside the code carries
 * every state too, so nothing depends on colour.
 */
function PickBox({ mode, onClick, disabled, name }: { mode: PickMode; onClick: () => void; disabled: boolean; name: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mode === "full" ? true : mode === "part" ? "mixed" : false}
      aria-label={`Mark ${name} picked`}
      title="Mark this item picked"
      onClick={onClick}
      disabled={disabled}
      className={cn("sh-tick", mode === "full" && "is-on", mode === "part" && "is-part", mode === "unavailable" && "is-off")}
    >
      {mode === "full" ? <Check aria-hidden="true" /> : mode === "part" ? <Minus aria-hidden="true" /> : mode === "unavailable" ? <X aria-hidden="true" /> : null}
    </button>
  )
}

const STATUS_CLASS: Record<PickMode, string> = {
  full: "bo-st bo-st--done",
  part: "bo-st bo-st--moving",
  unavailable: "bo-st bo-st--problem",
  none: "text-muted-foreground",
}

function LineRow({
  line,
  currency,
  editable,
  busy,
  scanned,
  onToggle,
  onAdjust,
  onCantFind,
}: {
  line: OrderLine
  currency: string
  editable: boolean
  busy: boolean
  scanned: boolean
  onToggle: () => void
  onAdjust: () => void
  onCantFind: () => void
}) {
  const mode = pickModeOf(line)
  return (
    <li className={cn("sh-pick", mode === "full" && "is-done", mode === "unavailable" && "is-short", scanned && "is-scanned")}>
      <PickBox mode={mode} onClick={onToggle} disabled={!editable || busy} name={line.name} />
      {line.imageUrl ? (
        <img src={line.imageUrl} alt="" className="sh-pick__img rounded-md border border-border object-cover" />
      ) : (
        <div className="sh-pick__img bo-img">
          <ImageOff aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0">
        {/* The size sold is part of the name a picker reads: they must never guess it. */}
        <div className="sh-pick__name">
          {line.name}
          {line.variantLabel ? <span className="text-muted-foreground"> · {line.variantLabel}</span> : null}
        </div>
        <div className="sh-pick__meta">
          <span className="font-mono text-[13px] whitespace-nowrap">{lineCodes(line.variantCode, line.sku)}</span>
          {line.gtin ? <span className="font-mono text-[13px] whitespace-nowrap">{line.gtin}</span> : null}
          <span className={cn("whitespace-nowrap", STATUS_CLASS[mode])}>{pickLabel(line)}</span>
          {line.refundedQuantity > 0 ? <span className="whitespace-nowrap">{line.refundedQuantity} refunded</span> : null}
        </div>
      </div>
      <div className="sh-pick__right">
        <div className="sh-qty">
          ×&nbsp;{line.orderedQuantity}
          <small>
            {formatMoney(line.unitPrice, currency)} · {formatMoney(line.lineTotal, currency)}
          </small>
        </div>
        {editable && mode === "none" ? (
          <Button variant="outline" size="sm" onClick={onCantFind} disabled={busy}>
            Can&apos;t find
          </Button>
        ) : null}
        {editable ? (
          <Button variant="ghost" size="icon" aria-label="Adjust" title="Adjust this line" onClick={onAdjust} disabled={busy}>
            <Pencil aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </li>
  )
}

function TotalRow({ label, value, strong }: { label: ReactNode; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1", strong && "mt-1 border-t border-border pt-2.5 font-semibold")}>
      <span className={cn(!strong && "text-muted-foreground")}>{label}</span>
      <span className="whitespace-nowrap tabular-nums">{value}</span>
    </div>
  )
}

// Refunded box

const REFUND_STATUS: Record<string, string> = {
  submitting: "sending",
  submitted: "with the bank",
  succeeded: "returned",
  failed: "failed",
  refused: "refused",
}

const REFUND_REASON: Record<string, string> = {
  item_not_supplied: "Not supplied",
  item_unusable: "Unusable",
  order_cancelled: "Order cancelled",
  goodwill: "Goodwill",
  external: "Outside the platform",
}

function RefundedBox({ detail }: { detail: OrderDetail }) {
  const m = detail.money
  return (
    <div className="mt-3 grid gap-1 border-t border-border pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-medium">Refunded</div>
        <div className="font-semibold whitespace-nowrap tabular-nums">−{formatMoney(m.refunded, m.currency)}</div>
      </div>
      {detail.refunds.map((r) => (
        <div key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
          <div className="text-muted-foreground">
            {REFUND_REASON[r.reason] ?? r.reason} · {formatWhen(r.createdAt)} · {REFUND_STATUS[r.status] ?? r.status}
            {r.actorLabel ? ` · ${r.actorLabel}` : ""}
          </div>
          <div className="whitespace-nowrap tabular-nums">{formatMoney(r.amount, m.currency)}</div>
        </div>
      ))}
      <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-2 font-semibold">
        <div>Net paid</div>
        <div className="whitespace-nowrap tabular-nums">{formatMoney(m.net, m.currency)}</div>
      </div>
    </div>
  )
}

// Shipments

/**
 * The hand-over, in Effy's terms: one package, handed to an Effy driver. It reads who · reference
 * (mono), the items in it, and its state · time. No carrier tracking number exists for a shop to show —
 * the reference is the order's own.
 */
function Shipments({ detail }: { detail: OrderDetail }) {
  const handedOver = detail.status === "ready_for_pickup" || detail.status === "collected" || detail.status === "delivered"
  if (!handedOver) return null
  const items = detail.lines
    .filter((l) => l.gatheredQuantity > 0)
    .map((l) => `${l.name.split(",")[0]} ×${l.gatheredQuantity}`)
    .join(", ")
  const meta =
    detail.status === "delivered"
      ? `Delivered · ${formatWhen(detail.handoff.deliveredAt ?? detail.stateChangedAt)}`
      : detail.status === "collected"
        ? `Collected · ${formatWhen(detail.stateChangedAt)}`
        : `Ready for pickup · ${formatWhen(detail.stateChangedAt)}`
  return (
    <div className="border-t border-border px-5 py-4 max-md:px-4">
      <div className="bo-eyebrow pb-2">Shipments</div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <div className="font-medium">
            {deliveredByText(detail.deliveredBy)} · <span className="bo-code">{detail.orderNumber}</span>
          </div>
          <div className="text-sm text-muted-foreground">{items || "Nothing picked"}</div>
        </div>
        <div className="text-sm whitespace-nowrap text-muted-foreground">{meta}</div>
      </div>
    </div>
  )
}

// Dialogs

const AVAILABILITY: { value: Exclude<PickMode, "none">; label: string; description: string }[] = [
  { value: "full", label: "Picked in full", description: "Every unit went in the bag." },
  { value: "part", label: "Found some", description: "Say how many went in the bag." },
  { value: "unavailable", label: "Can't find any", description: "Effy refunds the customer for this line." },
]

/** "Adjust this line" — the exception path when a line cannot simply be ticked (Packing board 06). */
function AdjustLineDialog({
  line,
  preset,
  onClose,
  onSave,
  saving,
}: {
  line: OrderLine | null
  preset?: Exclude<PickMode, "none">
  onClose: () => void
  onSave: (mode: Exclude<PickMode, "none">, units: number, note: string) => void
  saving: boolean
}) {
  const [mode, setMode] = useState<Exclude<PickMode, "none">>("full")
  const [units, setUnits] = useState("")
  const [note, setNote] = useState("")
  const [touched, setTouched] = useState(false)

  // Each opening starts from the line's current state (or the shortcut that opened it).
  useEffect(() => {
    if (!line) return
    const current = pickModeOf(line)
    setMode(preset ?? (current === "none" ? "full" : current))
    setUnits(current === "part" ? String(line.gatheredQuantity) : "")
    setNote(line.pickNote ?? "")
    setTouched(false)
  }, [line, preset])

  const ordered = line?.orderedQuantity ?? 0
  const err = mode === "part" ? unitsError(units, ordered) : null
  const showErr = mode === "part" && touched && !!err
  const n = Number(units) || 0
  const step = (d: number) => {
    setUnits(String(Math.max(0, Math.min(ordered, n + d))))
    setTouched(true)
  }

  return (
    <DesignSheet
      open={line !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Adjust this line"
      description="Use this when the line cannot simply be marked picked."
      saveLabel="Save line"
      saving={saving}
      onSave={() => {
        setTouched(true)
        if (err) return
        onSave(mode, mode === "part" ? Number(units) : 0, note.trim())
      }}
    >
      {line ? (
        <p className="font-medium">
          {line.name}
          {line.variantLabel ? ` · ${line.variantLabel}` : ""}
          <span className="block text-sm font-normal text-muted-foreground">
            {line.orderedQuantity} ordered · <span className="font-mono">{lineCodes(line.variantCode, line.sku)}</span>
          </span>
        </p>
      ) : null}
      <ChoiceCards label="Availability" value={mode} options={AVAILABILITY} onChange={setMode} />
      {mode === "part" ? (
        <div className="grid gap-2">
          <label htmlFor="adjust-units" className="text-[15px] font-medium">
            Units picked
          </label>
          <div className="flex items-center gap-3">
            <div className="sh-count">
              <button type="button" aria-label="One fewer" onClick={() => step(-1)} disabled={n <= 0}>
                <Minus aria-hidden="true" />
              </button>
              <Input
                id="adjust-units"
                inputMode="numeric"
                value={units}
                aria-invalid={showErr}
                onChange={(e) => {
                  setUnits(e.target.value)
                  setTouched(true)
                }}
                className="h-full! w-14 rounded-none! border-0! bg-transparent! text-center text-xl! font-semibold tabular-nums shadow-none!"
              />
              <button type="button" aria-label="One more" onClick={() => step(1)} disabled={n >= ordered}>
                <Plus aria-hidden="true" />
              </button>
            </div>
            <span className={cn("text-sm", showErr ? "font-medium text-foreground" : "text-muted-foreground")}>
              {showErr ? err : `Out of ${ordered} ordered.`}
            </span>
          </div>
        </div>
      ) : null}
      <SheetField label="Note for the team" htmlFor="adjust-note">
        <Textarea
          id="adjust-note"
          rows={3}
          maxLength={500}
          placeholder="Optional — what happened with this line"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </SheetField>
    </DesignSheet>
  )
}

/**
 * "Mark ready" — Effy's handover (Packing board 05): what goes in the package (the picked quantities, as
 * ticked), and a note that the customer is told automatically. Saving marks the order ready for an Effy
 * driver to collect. No carrier or tracking field: a shop never books either.
 */
function FulfilDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: OrderDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const transition = useTransitionFulfillment(detail.id)
  const picks = useSetPicks(detail.id)
  const inParcel = detail.lines.filter((l) => l.gatheredQuantity > 0)
  const short = detail.lines.reduce((n, l) => n + Math.max(0, l.orderedQuantity - l.gatheredQuantity), 0)
  // A line nobody touched is not going in the package. Handing over without recording it would
  // short the customer with nothing on the record — 055's refund proposal keys on "unavailable".
  const untouched = detail.lines.filter((l) => pickModeOf(l) === "none")

  async function save() {
    if (untouched.length > 0) {
      await picks.mutateAsync({
        lines: untouched.map((l) => ({ orderItemId: l.orderItemId, mode: "unavailable" as const })),
        toast: `${untouched.length} unpicked ${untouched.length === 1 ? "item" : "items"} marked unavailable`,
      })
    }
    transition.mutate({ to: "ready_for_pickup", from: "picking" }, { onSuccess: () => onOpenChange(false) })
  }

  return (
    <DesignSheet
      open={open}
      onOpenChange={onOpenChange}
      wide
      title="Ready for collection"
      description={`Check what goes in this package. ${detail.deliveredBy === "courier" ? "A courier" : "An Effy driver"} collects it.`}
      saveLabel="Mark ready for pickup"
      saving={transition.isPending || picks.isPending}
      canSave={detail.status === "picking" && inParcel.length > 0}
      onSave={() => void save().catch(() => undefined)}
    >
      <div className="grid">
        <div className="bo-eyebrow border-b border-border pb-2">In this parcel</div>
        {inParcel.map((l) => (
          <div key={l.orderItemId} className="flex min-h-14 items-center justify-between gap-3 border-b border-border py-2.5">
            <div className="grid min-w-0 flex-1 gap-0.5">
              <div className="font-medium">
                {l.name}
                {l.variantLabel ? ` · ${l.variantLabel}` : ""}
              </div>
              <div className="font-mono text-[13px] text-muted-foreground">{lineCodes(l.variantCode, l.sku)}</div>
            </div>
            <div className="whitespace-nowrap tabular-nums">
              {l.gatheredQuantity} <span className="text-muted-foreground">of {l.orderedQuantity}</span>
            </div>
          </div>
        ))}
      </div>
      {short > 0 ? (
        <p className="bo-alert bo-alert--muted grid-cols-1! text-sm">
          {short} {short === 1 ? "unit is" : "units are"} not in the package and {short === 1 ? "is" : "are"} recorded
          as unavailable{untouched.length > 0 ? ", including every item not ticked" : ""}.
        </p>
      ) : null}
      <div className="grid gap-0.5">
        <div className="font-medium">The customer is told</div>
        <div className="text-sm text-muted-foreground">They get a notification as soon as it&apos;s ready.</div>
      </div>
    </DesignSheet>
  )
}
