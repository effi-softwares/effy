import { Check, ImageOff, Minus, Pencil, X } from "lucide-react"

import { Button } from "@effy/design-system/ui"

import { cn } from "@/lib/utils"

import { lineCodes } from "../codes"
import { formatMoney, pickLabel, pickModeOf, type OrderLine, type PickMode } from "../orderConsole"

function PickBox({
  mode,
  onClick,
  disabled,
  name,
}: {
  mode: PickMode
  onClick: () => void
  disabled: boolean
  name: string
}) {
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
        "sh-tick",
        mode === "full" && "is-on",
        mode === "part" && "is-part",
        mode === "unavailable" && "is-off",
      )}
    >
      {mode === "full" ? (
        <Check aria-hidden="true" />
      ) : mode === "part" ? (
        <Minus aria-hidden="true" />
      ) : mode === "unavailable" ? (
        <X aria-hidden="true" />
      ) : null}
    </button>
  )
}

const STATUS_CLASS: Record<PickMode, string> = {
  full: "bo-st bo-st--done",
  part: "bo-st bo-st--moving",
  unavailable: "bo-st bo-st--problem",
  none: "text-muted-foreground",
}

export function LineRow({
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
    <li
      className={cn(
        "sh-pick",
        mode === "full" && "is-done",
        mode === "unavailable" && "is-short",
        scanned && "is-scanned",
      )}
    >
      <PickBox mode={mode} onClick={onToggle} disabled={!editable || busy} name={line.name} />
      {line.imageUrl ? (
        <img src={line.imageUrl} alt="" className="sh-pick__img rounded-md border border-border object-cover" />
      ) : (
        <div className="sh-pick__img bo-img">
          <ImageOff aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0">
        <div className="sh-pick__name">
          {line.name}
          {line.variantLabel ? <span className="text-muted-foreground"> · {line.variantLabel}</span> : null}
        </div>
        <div className="sh-pick__meta">
          <span className="font-mono text-[13px] whitespace-nowrap">{lineCodes(line.variantCode, line.sku)}</span>
          {line.gtin ? <span className="font-mono text-[13px] whitespace-nowrap">{line.gtin}</span> : null}
          <span className={cn("whitespace-nowrap", STATUS_CLASS[mode])}>{pickLabel(line)}</span>
          {line.refundedQuantity > 0 ? (
            <span className="whitespace-nowrap">{line.refundedQuantity} refunded</span>
          ) : null}
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
          <Button
            variant="ghost"
            size="icon"
            aria-label="Adjust"
            title="Adjust this line"
            onClick={onAdjust}
            disabled={busy}
          >
            <Pencil aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </li>
  )
}
