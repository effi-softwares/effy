import { deliveredByText, formatWhen, type OrderDetail } from "../orderConsole"

export function Shipments({ detail }: { detail: OrderDetail }) {
  const handedOver =
    detail.status === "ready_for_pickup" || detail.status === "collected" || detail.status === "delivered"
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
      <div className="ef-eyebrow pb-2">Shipments</div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <div className="font-medium">
            {deliveredByText(detail.deliveredBy)} · <span className="ef-code">{detail.orderNumber}</span>
          </div>
          <div className="text-sm text-muted-foreground">{items || "Nothing picked"}</div>
        </div>
        <div className="text-sm whitespace-nowrap text-muted-foreground">{meta}</div>
      </div>
    </div>
  )
}
