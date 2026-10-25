import {
  asapSentence, courierLines, DELIVERY_TYPE_WORDS, DELIVERY_WINDOW_WORDS, formatArrival, movedLines, type ArrivalEstimateDTO, type OrderDeliveryDTO, type OrderStage,
} from "@effy/shared-types"

import { Package, Truck } from "lucide-react"

import { ProgressTrack } from "@/components/receipt/ProgressTrack"
import { TrackingLink } from "@/components/receipt/TrackingLink"

/**
 * When the order arrives, and how far along it is. A time only when a window was sold; a day sold with
 * no time shows the day only. Nothing is derived here.
 */
export function ArrivalPanel({
  stage,
  arrivals,
  delivery = null,
}: {
  stage: OrderStage
  arrivals: ArrivalEstimateDTO[]
  delivery?: OrderDeliveryDTO | null
}) {
  // A courier order: who carries it and an estimate — never a window, never a promised day
  if (delivery?.type === "courier" && delivery.courierEstimate) {
    const [partner, estimate] = courierLines(delivery.courierEstimate)
    return (
      <section className="rounded-lg border bg-card shadow-xs">
        <div className="flex flex-col gap-2 px-6 pt-6" data-testid="arrival-courier">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-primary">
            <Package aria-hidden="true" className="size-4" />
            {DELIVERY_TYPE_WORDS.courier}
          </p>
          <p className="text-2xl font-semibold tracking-tight">{partner}</p>
          <p className="text-sm text-muted-foreground">{estimate}</p>
          {/* One link, or "by email" once several parcels are with the courier. Never a count. */}
          {delivery.tracking?.kind === "link" ? (
            <TrackingLink url={delivery.tracking.url} courierName={delivery.tracking.courierName} />
          ) : delivery.tracking?.kind === "email" ? (
            <p className="text-sm" data-testid="tracking-by-email">{DELIVERY_TYPE_WORDS.trackingByEmail}</p>
          ) : null}
          <MovedNote delivery={delivery} />
        </div>
        <div className="p-6">
          <ProgressTrack stage={stage} />
        </div>
      </section>
    )
  }

  // "as soon as possible": the estimate it was sold, said as one. Never a day.
  if (delivery?.type === "effy" && delivery.promise === "asap" && delivery.asapEstimate) {
    return (
      <section className="rounded-lg border bg-card shadow-xs">
        <div className="flex flex-col gap-2 px-6 pt-6" data-testid="arrival-asap">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-brand">
            <Truck aria-hidden="true" className="size-4" />
            {DELIVERY_TYPE_WORDS.effy}
          </p>
          <p className="text-2xl font-semibold tracking-tight">{DELIVERY_WINDOW_WORDS.asapTitle}</p>
          <p className="text-sm text-muted-foreground">{asapSentence(delivery.asapEstimate)}</p>
          <MovedNote delivery={delivery} />
        </div>
        <div className="p-6">
          <ProgressTrack stage={stage} />
        </div>
      </section>
    )
  }

  // "Delivered by Effy" on an order that says so; an order from before delivery types just "Arriving".
  const label = delivery?.type === "effy" ? DELIVERY_TYPE_WORDS.effy : "Arriving"
  // A day with no time: say that the missing hours are the promise.
  const anyTime = delivery?.type === "effy" && delivery.promise === "day"
  return (
    <section className="rounded-lg border bg-card shadow-xs">
      {arrivals.length > 0 ? (
        <div className="flex flex-col gap-4 px-6 pt-6">
          {arrivals.map((a, i) => (
            <Arrival key={`${a.method}-${i}`} arrival={a} multiple={arrivals.length > 1} index={i} label={label} anyTime={anyTime} />
          ))}
          <p className="text-sm text-muted-foreground">Updates here as your order moves — no need to refresh.</p>
          <MovedNote delivery={delivery} />
        </div>
      ) : null}
      <div className="p-6">
        <ProgressTrack stage={stage} />
      </div>
    </section>
  )
}

function MovedNote({ delivery }: { delivery: OrderDeliveryDTO | null }) {
  const lines = movedLines(delivery?.moved)
  if (lines.length === 0) return null
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted px-4 py-3 text-sm" data-testid="delivery-moved">
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </div>
  )
}

function Arrival({
  arrival,
  multiple,
  index,
  label,
  anyTime,
}: {
  arrival: ArrivalEstimateDTO
  multiple: boolean
  index: number
  label: string
  anyTime: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="inline-flex items-center gap-2 text-sm font-medium text-brand">
        <Truck aria-hidden="true" className="size-4" />
        <span>{multiple ? `Delivery ${index + 1}` : label}</span>
        <span aria-hidden="true">·</span>
        <span>{methodLabel(arrival.method)}</span>
      </p>
      <p className="text-2xl font-semibold tracking-tight">{arrivalLabel(arrival)}</p>
      {anyTime ? <p className="text-sm text-muted-foreground">{DELIVERY_WINDOW_WORDS.anyTimeDay}</p> : null}
    </div>
  )
}

function methodLabel(method: string): string {
  if (method === "same_day") return "Same-day"
  if (method === "scheduled") return "Scheduled"
  return "Standard"
}

/** The arrival in `formatArrival`'s words, shared with the emailed receipt and both apps. */
export function arrivalLabel(a: ArrivalEstimateDTO, now: Date = new Date()): string {
  return formatArrival(a, now)
}
