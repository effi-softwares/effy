import { DesignSheet } from "@/components/console/DesignSheet"

import { lineCodes } from "../codes"
import { pickModeOf, type OrderDetail } from "../orderConsole"
import { useSetPicks, useTransitionFulfillment } from "../queries"

export function FulfilDialog({
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
        <div className="ef-eyebrow border-b border-border pb-2">In this parcel</div>
        {inParcel.map((l) => (
          <div
            key={l.orderItemId}
            className="flex min-h-14 items-center justify-between gap-3 border-b border-border py-2.5"
          >
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
        <p className="ef-alert ef-alert--muted grid-cols-1! text-sm">
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
