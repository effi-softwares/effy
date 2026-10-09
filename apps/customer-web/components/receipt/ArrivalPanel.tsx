import {
  courierLines, DELIVERY_TYPE_WORDS, formatArrival, movedLines, type ArrivalEstimateDTO, type OrderDeliveryDTO, type OrderStage,
} from "@effy/shared-types"

import { toneForDeliveryMethod } from "@/app/checkout/_components/status-palette"
import { ProgressTrack } from "@/components/receipt/ProgressTrack"
import { StatusPill } from "@/components/receipt/StatusPill"
import { TrackingLink } from "@/components/receipt/TrackingLink"

/**
 * When the order arrives, and how far along it is (052 FR-007 / FR-008).
 *
 * ⚠ A TIME ONLY WHEN A WINDOW WAS SOLD (069). 052 corrected a designed "Today, 5:00 – 8:00 pm" down
 * to a date because the business had not made that promise. It has now: a same-day order carries the
 * window the customer chose, and this panel says it. An order with no window — every standard order,
 * and everything placed before 069 — still shows a day and nothing finer, and an order with no
 * promise at all still says the date will be confirmed. Nothing is derived here.
 *
 * ⚠ More than one estimate means the order arrives in more than one delivery. That is a fact about
 * the CUSTOMER'S experience — it names no shop and implies no fulfilment structure (FR-009).
 */
export function ArrivalPanel({
  stage,
  arrivals,
  delivery = null,
}: {
  stage: OrderStage
  arrivals: ArrivalEstimateDTO[]
  /** 079 — who delivers the order. Absent on an order placed before orders had a delivery type. */
  delivery?: OrderDeliveryDTO | null
}) {
  // 079 — a courier delivers: no window and no day to state, so the panel says who and the ESTIMATE
  // the order was sold. ⚠ Never the arrivals — a courier order's packages are only routed as
  // "standard", and reading them here would print "Standard" over a parcel a courier is carrying.
  if (delivery?.type === "courier" && delivery.courierEstimate) {
    const [partner, estimate] = courierLines(delivery.courierEstimate)
    return (
      <section className="rounded-xl border p-5">
        <div className="flex flex-col gap-2 border-b pb-4" data-testid="arrival-courier">
          <p className="text-[13px] text-muted-foreground">{DELIVERY_TYPE_WORDS.courier}</p>
          <p className="text-xl font-semibold leading-tight tracking-[-0.01em]">{partner}</p>
          <p className="text-sm text-muted-foreground">{estimate}</p>
          {/* 080 Q8 — one consignment: its link; several: each parcel's tracking comes by email.
              ⚠ Never a count. */}
          {delivery.tracking?.kind === "link" ? (
            <TrackingLink url={delivery.tracking.url} courierName={delivery.tracking.courierName} />
          ) : delivery.tracking?.kind === "email" ? (
            <p className="text-sm" data-testid="tracking-by-email">{DELIVERY_TYPE_WORDS.trackingByEmail}</p>
          ) : null}
          <MovedNote delivery={delivery} />
        </div>
        <div className="pt-4">
          <ProgressTrack stage={stage} />
        </div>
      </section>
    )
  }

  // An order Effy delivers says so; one placed before delivery types says "Arriving", as it always has.
  const label = delivery?.type === "effy" ? DELIVERY_TYPE_WORDS.effy : "Arriving"
  return (
    <section className="rounded-xl border p-5">
      {arrivals.length > 0 ? (
        <div className="flex flex-col gap-4 border-b pb-4">
          {arrivals.map((a, i) => (
            <Arrival key={`${a.method}-${i}`} arrival={a} multiple={arrivals.length > 1} index={i} label={label} />
          ))}
          <MovedNote delivery={delivery} />
        </div>
      ) : null}

      <div className={arrivals.length > 0 ? "pt-4" : undefined}>
        <ProgressTrack stage={stage} />
      </div>
    </section>
  )
}

/**
 * 081 — Effy moved the order to courier delivery (or back): what changed, and what the customer
 * received for it, in the one wording every surface prints (`movedLines`). ⚠ Never why.
 */
function MovedNote({ delivery }: { delivery: OrderDeliveryDTO | null }) {
  const lines = movedLines(delivery?.moved)
  if (lines.length === 0) return null
  return (
    <div className="flex flex-col gap-1 text-sm" data-testid="delivery-moved">
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
}: {
  arrival: ArrivalEstimateDTO
  multiple: boolean
  index: number
  label: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {multiple ? `Delivery ${index + 1}` : label}
        </p>
        <StatusPill tone={toneForDeliveryMethod(arrival.method)}>{methodLabel(arrival.method)}</StatusPill>
      </div>
      <p className="text-xl font-semibold leading-tight tracking-[-0.01em]">{arrivalLabel(arrival)}</p>
    </div>
  )
}

/**
 * The pill beside an Effy delivery: the customer's own short word for it. ⚠ Unchanged by 079, on
 * purpose — nothing a customer already sees changes when that feature is released. Never reached for
 * a courier order, which is neither word.
 */
function methodLabel(method: string): string {
  if (method === "same_day") return "Same-day"
  if (method === "scheduled") return "Scheduled"
  return "Standard"
}

/**
 * The arrival, in the plainest words the DATA supports.
 *
 * ⚠ THE WORDING IS `formatArrival`'S (069): the emailed receipt and both apps say it the same way,
 * from the same fixture. This file used to carry its own copy of the date formatting, beside the
 * email's — two implementations of one sentence, which is the shape 052 deleted
 * `summarizeFulfillment` for.
 */
export function arrivalLabel(a: ArrivalEstimateDTO, now: Date = new Date()): string {
  return formatArrival(a, now)
}
