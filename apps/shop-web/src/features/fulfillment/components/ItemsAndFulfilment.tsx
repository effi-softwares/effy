import { useEffect, useState, type ReactNode } from "react"
import { ImageOff } from "lucide-react"

import { toast } from "@effy/design-system/ui"

import { DesignSheet, SheetField } from "@/components/console/DesignSheet"
import { cn } from "@/lib/utils"

import {
  canPick,
  formatMoney,
  formatWhen,
  methodText,
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

/**
 * "Items and fulfilment" — the design's merged section (057 A3 revision 2): the priced lines ARE the
 * pick list. One click on a line's box marks the whole line picked; clicking again clears it. "Select
 * all" / "Clear all" does every line. The exception path — part picked, unavailable, a note — is the
 * line's "Adjust" dialog. Below the totals, "Fulfil {n} items" hands the picked package over.
 *
 * ⚠ PICKING IS PER LINE, NOT PER UNIT. The steppers are gone; a line's state is still 020's two
 * absolute counts, set in one write per click (see `setPicks` on the server).
 *
 * ⚠ THE DESIGN'S "Edit order" IS NOT HERE. An order is a paid record 055 refuses to edit; a line the
 * shop cannot supply is marked Unavailable, and the money follows through a refund.
 *
 * ⚠ "Fulfil" HANDS THE PACKAGE TO EFFY, IT DOES NOT BOOK A CARRIER. A shop's package is collected by an
 * Effy driver (049) — so the design's carrier and tracking fields have nothing to hold, and its
 * "Shipments" block lists that handover (collected, delivered) instead.
 */
export function ItemsAndFulfilment({ detail }: { detail: OrderDetail }) {
  const picks = useSetPicks(detail.id)
  const [adjusting, setAdjusting] = useState<OrderLine | null>(null)
  const [fulfilOpen, setFulfilOpen] = useState(false)

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

  function fulfil() {
    if (!pickedAny) {
      toast("Tick at least one item first")
      return
    }
    setFulfilOpen(true)
  }

  const m = detail.money
  const others = Math.round(Number(m.itemSubtotal) * 100) - Math.round(Number(m.shopSubtotal) * 100)

  return (
    <section className="min-w-0">
      <div className="border-border flex flex-wrap items-end gap-4 border-b pb-3.5">
        <div className="grid min-w-0 gap-1">
          <h2 className="text-[15px] font-semibold tracking-[-.01em]">Items and fulfilment</h2>
          <p className="text-muted-foreground text-[12.5px]">
            {pickSummary(detail.lines)} · {methodText(detail.deliveryMethod)} delivery
          </p>
        </div>
        <div className="flex-1" />
        {editable ? (
          <TextButton onClick={toggleAll} disabled={busy}>
            {allPicked ? "Clear all" : "Select all"}
          </TextButton>
        ) : null}
      </div>

      <table className="w-full border-collapse">
        <tbody>
          {detail.lines.map((l) => (
            <LineRow
              key={l.orderItemId}
              line={l}
              currency={m.currency}
              editable={editable}
              busy={busy}
              onToggle={() => toggleLine(l)}
              onAdjust={() => setAdjusting(l)}
            />
          ))}
          <TotalRow label="Subtotal" value={formatMoney(m.shopSubtotal, m.currency)} first />
          {others > 0 ? (
            <TotalRow label="Items from other shops" value={formatMoney((others / 100).toFixed(2), m.currency)} />
          ) : null}
          {Number(m.discount) > 0 ? (
            <TotalRow
              label={
                <>
                  Discount {m.promoCode ? <span className="font-mono">{m.promoCode}</span> : null}
                </>
              }
              value={`−${formatMoney(m.discount, m.currency)}`}
            />
          ) : null}
          <TotalRow label="Shipping" value={formatMoney(m.deliveryFee, m.currency)} last />
          <tr className="border-border border-t">
            <td colSpan={3} className="pt-2.5 pr-2 text-sm font-semibold">
              Total
            </td>
            <td className="pt-2.5 text-right text-sm font-semibold whitespace-nowrap tabular-nums">
              {formatMoney(m.total, m.currency)}
            </td>
          </tr>
        </tbody>
      </table>

      {detail.refunds.length > 0 ? <RefundedBox detail={detail} /> : null}

      {editable ? (
        <div className="mt-6 flex flex-wrap items-center gap-3.5">
          <button
            type="button"
            onClick={fulfil}
            aria-disabled={!pickedAny}
            className={cn(
              "h-9 rounded-md border-none px-3.5 text-[13.5px] font-medium whitespace-nowrap",
              pickedAny
                ? "bg-primary text-primary-foreground cursor-pointer hover:opacity-90"
                : "bg-muted text-muted-foreground cursor-default",
            )}
          >
            {pickedAny ? `Fulfil ${pickedFull} ${pickedFull === 1 ? "item" : "items"}` : "Fulfil picked items"}
          </button>
          <div className="text-muted-foreground text-[12.5px] text-pretty">
            {pickedAny
              ? "Marks everything ticked above ready for an Effy driver to collect."
              : "Tick the items you have picked, or use Adjust for part-picked and unavailable lines."}
          </div>
        </div>
      ) : null}

      <Shipments detail={detail} />

      <AdjustLineDialog
        line={adjusting}
        onClose={() => setAdjusting(null)}
        saving={busy}
        onSave={(mode, units, note) => {
          const l = adjusting!
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

// ── A line ────────────────────────────────────────────────────────────────────────────────────

/**
 * The line's box: 26px, 7px radius. Its four states by fill, border and glyph —
 * full ✓ on primary · part – · unavailable × in the error colour · none empty.
 *
 * ⚠ THE DESIGN'S PART-PICKED AMBER AND PICKED GREEN ARE NOT USED: amber is a third UI hue and
 * `--success` may not be text (Principle V). Part-picked reads by its en dash and a foreground border;
 * the status words under the SKU carry every state, so nothing depends on colour.
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
      className={cn(
        "grid size-[26px] shrink-0 place-items-center rounded-[7px] border-[1.5px] p-0 text-[15px] leading-none",
        !disabled && "hover:border-primary cursor-pointer",
        disabled && "cursor-default",
        mode === "full" && "border-primary bg-primary text-primary-foreground",
        mode === "part" && "border-foreground bg-muted text-foreground",
        mode === "unavailable" && "border-destructive bg-background text-destructive",
        mode === "none" && "border-input bg-background",
      )}
    >
      {mode === "full" ? "✓" : mode === "part" ? "–" : mode === "unavailable" ? "×" : ""}
    </button>
  )
}

function LineRow({
  line,
  currency,
  editable,
  busy,
  onToggle,
  onAdjust,
}: {
  line: OrderLine
  currency: string
  editable: boolean
  busy: boolean
  onToggle: () => void
  onAdjust: () => void
}) {
  const mode = pickModeOf(line)
  return (
    <tr className={cn("border-border border-b", mode === "unavailable" && "bg-muted")}>
      <td className="w-[82px] py-[18px] pr-2">
        <div className="flex items-center gap-3">
          <PickBox mode={mode} onClick={onToggle} disabled={!editable || busy} name={line.name} />
          {line.imageUrl ? (
            <img src={line.imageUrl} alt="" className="border-border size-[34px] shrink-0 rounded-md border object-cover" />
          ) : (
            <div className="border-border bg-muted text-muted-foreground grid size-[34px] shrink-0 place-items-center rounded-md border">
              <ImageOff className="size-3.5" />
            </div>
          )}
        </div>
      </td>
      <td className="px-2 py-[18px]">
        <div className="text-sm font-medium">{line.name}</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground font-mono text-[12px] whitespace-nowrap">{line.sku ?? "no SKU"}</span>
          <span
            className={cn(
              "text-[11.5px] whitespace-nowrap",
              mode === "full" && "text-foreground font-medium",
              mode === "part" && "text-foreground font-semibold",
              mode === "unavailable" && "text-destructive font-medium",
              mode === "none" && "text-muted-foreground",
            )}
          >
            {pickLabel(line)}
          </span>
          {line.refundedQuantity > 0 ? (
            <span className="text-muted-foreground text-[11.5px] whitespace-nowrap">{line.refundedQuantity} refunded</span>
          ) : null}
        </div>
      </td>
      <td className="px-2 py-[18px] text-right whitespace-nowrap">
        <div className="text-muted-foreground text-[13px]">
          {line.orderedQuantity} × {formatMoney(line.unitPrice, currency)}
        </div>
        {editable ? (
          <TextButton small onClick={onAdjust} disabled={busy}>
            Adjust
          </TextButton>
        ) : null}
      </td>
      <td className="w-[110px] py-[18px] pl-2 text-right text-sm font-medium tabular-nums">
        {formatMoney(line.lineTotal, currency)}
      </td>
    </tr>
  )
}

function TotalRow({ label, value, first, last }: { label: ReactNode; value: string; first?: boolean; last?: boolean }) {
  const pad = first ? "pt-5 pb-1" : last ? "pt-[3px] pb-2.5" : "py-[3px]"
  return (
    <tr>
      <td colSpan={3} className={cn("text-muted-foreground pr-2 text-[13px]", pad)}>
        {label}
      </td>
      <td className={cn("text-right text-[13px] whitespace-nowrap tabular-nums", pad)}>{value}</td>
    </tr>
  )
}

function TextButton({
  children,
  onClick,
  disabled,
  small,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  small?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "text-muted-foreground hover:text-foreground cursor-pointer border-none bg-transparent p-0 font-medium whitespace-nowrap disabled:cursor-default disabled:opacity-50",
        small ? "text-[12px]" : "text-[13px]",
      )}
    >
      {children}
    </button>
  )
}

// ── Refunded box ──────────────────────────────────────────────────────────────────────────────

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
    <div className="border-border mt-3.5 grid gap-2.5 rounded-[var(--radius)] border px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[13px] font-semibold">Refunded</div>
        <div className="text-destructive text-[13.5px] font-semibold whitespace-nowrap tabular-nums">
          −{formatMoney(m.refunded, m.currency)}
        </div>
      </div>
      {detail.refunds.map((r) => (
        <div key={r.id} className="border-border flex items-baseline justify-between gap-3 border-t pt-2">
          <div className="text-muted-foreground text-[12.5px]">
            {REFUND_REASON[r.reason] ?? r.reason} · {formatWhen(r.createdAt)} · {REFUND_STATUS[r.status] ?? r.status}
            {r.actorLabel ? ` · ${r.actorLabel}` : ""}
          </div>
          <div className="text-[12.5px] whitespace-nowrap tabular-nums">{formatMoney(r.amount, m.currency)}</div>
        </div>
      ))}
      <div className="border-border flex items-baseline justify-between gap-3 border-t pt-2">
        <div className="text-[13px] font-semibold">Net paid</div>
        <div className="text-[13px] font-semibold whitespace-nowrap tabular-nums">{formatMoney(m.net, m.currency)}</div>
      </div>
    </div>
  )
}

// ── Shipments ─────────────────────────────────────────────────────────────────────────────────

/**
 * The design's "Shipments" block, in Effy's terms: one package, handed to an Effy driver. The row
 * reads carrier · reference (mono), the items in it, and its state · date. No carrier tracking number
 * exists for a shop to show — the reference is the order's own.
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
        ? `Collected · ${formatWhen(detail.handoff.collectedAt ?? detail.stateChangedAt)}`
        : `Ready for pickup · ${formatWhen(detail.stateChangedAt)}`
  return (
    <div className="mt-[34px] grid">
      <div className="text-muted-foreground pb-1 text-[11.5px] font-medium tracking-[.04em] uppercase">Shipments</div>
      <div className="border-border flex flex-wrap items-baseline justify-between gap-3 border-t py-4">
        <div className="grid min-w-0 gap-[3px]">
          <div className="text-[13.5px] font-medium">
            Effy driver · <span className="font-mono text-[12.5px]">{detail.orderNumber}</span>
          </div>
          <div className="text-muted-foreground text-[12.5px]">{items || "Nothing picked"}</div>
        </div>
        <div className="text-muted-foreground text-[12.5px] whitespace-nowrap">{meta}</div>
      </div>
    </div>
  )
}

// ── Dialogs ───────────────────────────────────────────────────────────────────────────────────

const AVAILABILITY: { value: Exclude<PickMode, "none">; label: string }[] = [
  { value: "full", label: "Picked in full" },
  { value: "part", label: "Part picked" },
  { value: "unavailable", label: "Unavailable" },
]

/** "Adjust this line" — the exception path when a line cannot simply be marked picked. */
function AdjustLineDialog({
  line,
  onClose,
  onSave,
  saving,
}: {
  line: OrderLine | null
  onClose: () => void
  onSave: (mode: Exclude<PickMode, "none">, units: number, note: string) => void
  saving: boolean
}) {
  const [mode, setMode] = useState<Exclude<PickMode, "none">>("full")
  const [units, setUnits] = useState("")
  const [note, setNote] = useState("")
  const [touched, setTouched] = useState(false)

  // Each opening starts from the line's current state.
  useEffect(() => {
    if (!line) return
    const current = pickModeOf(line)
    setMode(current === "none" ? "full" : current)
    setUnits(current === "part" ? String(line.gatheredQuantity) : "")
    setNote(line.pickNote ?? "")
    setTouched(false)
  }, [line])

  const ordered = line?.orderedQuantity ?? 0
  const err = mode === "part" ? unitsError(units, ordered) : null
  const showErr = mode === "part" && touched && !!err

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
      <SheetField label="Availability" htmlFor="adjust-mode">
        <select
          id="adjust-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as Exclude<PickMode, "none">)}
          className="border-input bg-background focus:border-ring h-9 cursor-pointer rounded-md border px-2.5 text-[13.5px] outline-none"
        >
          {AVAILABILITY.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </SheetField>
      {mode === "part" ? (
        <div className="grid gap-1.5">
          <label htmlFor="adjust-units" className="text-[13px] font-medium">
            Units picked
          </label>
          <input
            id="adjust-units"
            inputMode="numeric"
            value={units}
            aria-invalid={showErr}
            onChange={(e) => {
              setUnits(e.target.value)
              setTouched(true)
            }}
            className={cn(
              "bg-background h-9 rounded-md border px-[11px] text-[13.5px] tabular-nums outline-none",
              showErr ? "border-destructive" : "border-input focus:border-ring",
            )}
          />
          <div className={cn("text-[12px]", showErr ? "text-destructive" : "text-muted-foreground")}>
            {showErr ? err : `Out of ${ordered} ordered.`}
          </div>
        </div>
      ) : null}
      <SheetField label="Note for the team" htmlFor="adjust-note">
        <textarea
          id="adjust-note"
          rows={3}
          maxLength={500}
          placeholder="Optional — what happened with this line"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="border-input bg-background focus:border-ring resize-y rounded-md border px-[11px] py-[9px] text-[13.5px] leading-normal outline-none"
        />
      </SheetField>
    </DesignSheet>
  )
}

/**
 * "Fulfil" — the design's shipment dialog, as Effy's handover: what goes in the package (the picked
 * quantities, as ticked), and a note that the customer is told automatically. Saving marks the order
 * ready for an Effy driver to collect. ⚠ No carrier or tracking field: a shop never books either (049).
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
  // ⚠ A line nobody touched is not going in the package. Handing over without recording it would
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
      description="Check what goes in this package. An Effy driver collects it."
      saveLabel="Mark ready for pickup"
      saving={transition.isPending || picks.isPending}
      canSave={detail.status === "picking" && inParcel.length > 0}
      onSave={() => void save().catch(() => undefined)}
    >
      <div className="grid">
        <div className="border-border text-muted-foreground border-b pb-2 text-[11.5px] font-medium tracking-[.04em] uppercase">
          In this parcel
        </div>
        {inParcel.map((l) => (
          <div key={l.orderItemId} className="border-border flex items-center justify-between gap-3 border-b py-2.5">
            <div className="grid min-w-0 flex-1 gap-0.5">
              <div className="text-[13.5px] font-medium">{l.name}</div>
              <div className="text-muted-foreground font-mono text-[12px]">{l.sku ?? "no SKU"}</div>
            </div>
            <div className="text-[13px] whitespace-nowrap tabular-nums">
              {l.gatheredQuantity} <span className="text-muted-foreground">of {l.orderedQuantity}</span>
            </div>
          </div>
        ))}
      </div>
      {short > 0 ? (
        <p className="text-muted-foreground text-[12.5px]">
          {short} {short === 1 ? "unit is" : "units are"} not in the package and {short === 1 ? "is" : "are"} recorded
          as unavailable{untouched.length > 0 ? ", including every item not ticked" : ""}.
        </p>
      ) : null}
      <div className="grid gap-0.5">
        <div className="text-[13.5px] font-medium">The customer is told</div>
        <div className="text-muted-foreground text-[12.5px]">They get a notification as soon as it&apos;s ready.</div>
      </div>
    </DesignSheet>
  )
}
