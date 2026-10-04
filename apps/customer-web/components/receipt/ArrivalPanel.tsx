import { formatArrival, type ArrivalEstimateDTO, type OrderStage } from "@effy/shared-types"

import { toneForDeliveryMethod } from "@/app/checkout/_components/status-palette"
import { ProgressTrack } from "@/components/receipt/ProgressTrack"
import { StatusPill } from "@/components/receipt/StatusPill"

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
}: {
  stage: OrderStage
  arrivals: ArrivalEstimateDTO[]
}) {
  return (
    <section className="rounded-xl border p-5">
      {arrivals.length > 0 ? (
        <div className="flex flex-col gap-4 border-b pb-4">
          {arrivals.map((a, i) => (
            <Arrival key={`${a.method}-${i}`} arrival={a} multiple={arrivals.length > 1} index={i} />
          ))}
        </div>
      ) : null}

      <div className={arrivals.length > 0 ? "pt-4" : undefined}>
        <ProgressTrack stage={stage} />
      </div>
    </section>
  )
}

function Arrival({
  arrival,
  multiple,
  index,
}: {
  arrival: ArrivalEstimateDTO
  multiple: boolean
  index: number
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {multiple ? `Delivery ${index + 1}` : "Arriving"}
        </p>
        <StatusPill tone={toneForDeliveryMethod(arrival.method)}>{methodLabel(arrival.method)}</StatusPill>
      </div>
      <p className="text-xl font-semibold leading-tight tracking-[-0.01em]">{arrivalLabel(arrival)}</p>
    </div>
  )
}

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
