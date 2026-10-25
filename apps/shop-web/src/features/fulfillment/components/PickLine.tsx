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
        "grid size-11 cursor-pointer place-items-center rounded-xl border-2 border-input bg-background p-0 text-primary-foreground transition-[background-color,border-color] duration-(--dur-fast) ease-[ease] disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-6",
        mode === "full" && "border-primary bg-primary-fill",
        mode === "part" && "border-primary bg-primary-muted text-primary",
        mode === "unavailable" && "border-dashed text-foreground",
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
  full: "ef-st ef-st--done",
  part: "ef-st ef-st--moving",
  unavailable: "ef-st ef-st--problem",
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
    <li className={cn("pick", mode === "unavailable" && "is-short", scanned && "is-scanned")}>
      <PickBox mode={mode} onClick={onToggle} disabled={!editable || busy} name={line.name} />
      {line.imageUrl ? (
        <img src={line.imageUrl} alt="" className="pick__img rounded-md border border-border object-cover" />
      ) : (
        <div className="pick__img ef-img">
          <ImageOff aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0">
        <div className={cn("text-base leading-6 font-medium", mode === "full" && "text-muted-foreground")}>
          {line.name}
          {line.variantLabel ? <span className="text-muted-foreground"> · {line.variantLabel}</span> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-5 text-muted-foreground">
          <span className="font-mono text-sm whitespace-nowrap">{lineCodes(line.variantCode, line.sku)}</span>
          {line.gtin ? <span className="font-mono text-sm whitespace-nowrap">{line.gtin}</span> : null}
          <span className={cn("whitespace-nowrap", STATUS_CLASS[mode])}>{pickLabel(line)}</span>
          {line.refundedQuantity > 0 ? (
            <span className="whitespace-nowrap">{line.refundedQuantity} refunded</span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3 max-md:col-span-full max-md:justify-between max-md:pl-14">
        <div className="min-w-14 text-right text-xl font-semibold tracking-[-0.01em] tabular-nums [&_small]:block [&_small]:text-xs [&_small]:font-normal [&_small]:tracking-normal [&_small]:text-muted-foreground">
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
