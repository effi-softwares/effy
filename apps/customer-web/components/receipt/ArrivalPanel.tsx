import type { ArrivalEstimateDTO, OrderStage } from "@effy/shared-types"

import { toneForDeliveryMethod } from "@/app/checkout/_components/status-palette"
import { ProgressTrack } from "@/components/receipt/ProgressTrack"
import { StatusPill } from "@/components/receipt/StatusPill"

/**
 * When the order arrives, and how far along it is (052 FR-007 / FR-008).
 *
 * ⚠ DATES, NEVER TIMES. `promisedFrom`/`promisedTo` are `date` columns — the platform has no delivery
 * time window and cannot derive one (research R4). An earlier draft of this design showed
 * "Today, 5:00 – 8:00 pm"; that was a promise the business has not made, printed on the one document
 * a customer treats as a record.
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
 * ⚠ When the platform has no promise, this says so rather than inventing one. "We'll confirm your
 * delivery date" is honest; a fabricated date on a receipt is not.
 */
export function arrivalLabel(a: ArrivalEstimateDTO): string {
  if (!a.promisedFrom && !a.promisedTo) return "We'll confirm your delivery date"

  const from = a.promisedFrom ?? a.promisedTo!
  const to = a.promisedTo ?? a.promisedFrom!

  if (from === to) return relativeDay(from)
  return `${formatDay(from)} – ${formatDay(to)}`
}

/** "Today" / "Tomorrow" where it applies, otherwise the date — judged in the trading timezone. */
function relativeDay(isoDate: string): string {
  const today = melbourneToday()
  if (isoDate === today) return "Today"
  if (isoDate === addDays(today, 1)) return "Tomorrow"
  return formatDay(isoDate)
}

function formatDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short" }).format(d)
}

/**
 * ⚠ `Australia/Melbourne`, not the server's zone. "Today" is a claim about the shopper's day, and a
 * server in another timezone would get it wrong for hours either side of midnight. 047 judges its
 * same-day cutoff in this same wall-clock for the same reason.
 */
function melbourneToday(): string {
  // en-CA yields yyyy-mm-dd, which is exactly the shape the wire uses.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date())
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
