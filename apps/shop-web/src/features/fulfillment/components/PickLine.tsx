import { Check, ImageOff, Minus, Pencil, X } from "lucide-react"

import { Badge, Button } from "@effy/design-system/ui"

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
    <Button
      type="button"
      variant="outline"
      size="icon-lg"
      role="checkbox"
      aria-checked={mode === "full" ? true : mode === "part" ? "mixed" : false}
      aria-label={`Mark ${name} picked`}
      title="Mark this item picked"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "border-2 [&_svg:not([class*='size-'])]:size-5",
        mode === "full" &&
          "border-primary bg-primary-fill text-primary-foreground hover:bg-primary-fill/90 hover:text-primary-foreground",
        mode === "part" && "border-primary bg-primary-muted text-primary hover:bg-primary-muted",
        mode === "unavailable" && "border-dashed",
      )}
    >
      {mode === "full" ? (
        <Check aria-hidden="true" />
      ) : mode === "part" ? (
        <Minus aria-hidden="true" />
      ) : mode === "unavailable" ? (
        <X aria-hidden="true" />
      ) : null}
    </Button>
  )
}

const STATUS_VARIANT: Record<Exclude<PickMode, "none">, "success" | "default" | "destructive"> = {
  full: "success",
  part: "default",
  unavailable: "destructive",
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
        <img src={line.imageUrl} alt="" className="pick__img rounded-lg border object-cover" />
      ) : (
        <div className="pick__img grid place-items-center rounded-lg bg-muted text-muted-foreground">
          <ImageOff aria-hidden="true" className="size-5" />
        </div>
      )}
      <div className="min-w-0">
        <div className={cn("text-sm leading-5 font-medium", mode === "full" && "text-muted-foreground")}>
          {line.name}
          {line.variantLabel ? <span className="text-muted-foreground"> · {line.variantLabel}</span> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-5 text-muted-foreground">
          <span className="font-mono text-sm whitespace-nowrap">{lineCodes(line.variantCode, line.sku)}</span>
          {line.gtin ? <span className="font-mono text-sm whitespace-nowrap">{line.gtin}</span> : null}
          {mode === "none" ? (
            <span className="whitespace-nowrap">{pickLabel(line)}</span>
          ) : (
            <Badge variant={STATUS_VARIANT[mode]}>{pickLabel(line)}</Badge>
          )}
          {line.refundedQuantity > 0 ? (
            <span className="whitespace-nowrap">{line.refundedQuantity} refunded</span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 max-md:col-span-full max-md:justify-between max-md:pl-14">
        <div className="min-w-14 text-right text-lg font-semibold tracking-[-0.01em] tabular-nums [&_small]:block [&_small]:text-xs [&_small]:font-normal [&_small]:tracking-normal [&_small]:text-muted-foreground">
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
