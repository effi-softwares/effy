import { asapSentence, DELIVERY_TYPE_WORDS, DELIVERY_WINDOW_WORDS, formatArrival, type OrderSummaryDTO } from "@effy/shared-types"

/**
 * What one row of the order history SAYS (reference: Orders · Order history): the badge, the line
 * under it, and which filter it belongs to.
 *
 * ⚠ ONE PLACE, so the badge, the line and the filter cannot disagree about the same order. Everything
 * is read from what the server derived (`stage`, `fullyRefunded`, `arrivalEstimates`) — nothing here
 * works a stage out for itself.
 */
export type OrderFilter = "all" | "progress" | "delivered" | "refunded" | "cancelled"
export const ORDER_FILTERS: ReadonlyArray<{ key: OrderFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "progress", label: "In progress" },
  { key: "delivered", label: "Delivered" },
  { key: "refunded", label: "Refunded" },
  { key: "cancelled", label: "Cancelled" },
]

export type OrderTone = "outline" | "default" | "brand" | "secondary"

export interface OrderRowWords {
  badge: string
  tone: OrderTone
  /** The line under the header. Absent when there is nothing true to add. */
  line: string | null
  /** Still on its way to the customer — the row's first action is "Track order". */
  inProgress: boolean
}

const DELIVERED_AT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Melbourne",
})

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

export function orderRowWords(o: OrderSummaryDTO, now: Date = new Date()): OrderRowWords {
  if (o.status === "canceled") return { badge: "Cancelled", tone: "secondary", line: "This order was cancelled.", inProgress: false }
  if (o.status === "failed") return { badge: "Payment failed", tone: "secondary", line: "The payment didn't go through, so nothing was sent.", inProgress: false }
  if (o.status === "pending_payment") return { badge: "Awaiting payment", tone: "outline", line: "We're waiting for the payment to complete.", inProgress: false }
  if (o.fullyRefunded) return { badge: "Refunded", tone: "secondary", line: "Refunded in full", inProgress: false }

  const promise = promiseOf(o, now)
  switch (o.stage) {
    case "delivered":
      return {
        badge: "Delivered",
        tone: "brand",
        line: o.deliveredAt ? `Delivered ${DELIVERED_AT.format(new Date(o.deliveredAt))}` : "Delivered",
        inProgress: false,
      }
    case "on_the_way":
      return { badge: "On the way", tone: "default", line: promise ? `On the way — ${lowerFirst(promise)}` : "On the way", inProgress: true }
    case "packing":
      return { badge: "Being packed", tone: "outline", line: promise ? `Arriving ${lowerFirst(promise)}` : "Your order is being packed", inProgress: true }
    case "confirmed":
      return { badge: "Confirmed", tone: "outline", line: promise ? `Arriving ${lowerFirst(promise)}` : "We've received your order", inProgress: true }
    default:
      return { badge: "Paid", tone: "outline", line: null, inProgress: false }
  }
}

/** The promise the order was sold: a window or a day; for a courier, its estimate — said as one. */
function promiseOf(o: OrderSummaryDTO, now: Date): string | null {
  if (o.delivery.type === "courier") {
    return o.delivery.courierEstimate
      ? `${DELIVERY_TYPE_WORDS.courierEstimatePrefix} ${o.delivery.courierEstimate} ${DELIVERY_TYPE_WORDS.courierEstimateSuffix}`
      : null
  }
  // 085 — "as soon as possible" was sold an estimate, never a day.
  if (o.delivery.promise === "asap") return o.delivery.asapEstimate ? asapSentence(o.delivery.asapEstimate) : null
  const first = o.arrivalEstimates?.[0]
  if (!first) return null
  // No promise on record says so in its own words; that is not something to prefix with "Arriving".
  if (!first.windowStart && !first.promisedFrom && !first.promisedTo) return null
  const day = formatArrival(first, now)
  return o.delivery.promise === "day" ? `${day}, ${DELIVERY_WINDOW_WORDS.anyTimeDay.toLowerCase()}` : day
}

export function matchesFilter(o: OrderSummaryDTO, filter: OrderFilter): boolean {
  switch (filter) {
    case "progress":
      return orderRowWords(o).inProgress
    case "delivered":
      return o.status === "paid" && o.stage === "delivered" && !o.fullyRefunded
    case "refunded":
      return Boolean(o.refundedTotal)
    case "cancelled":
      return o.status === "canceled"
    default:
      return true
  }
}

/* ── The time period ─────────────────────────────────────────────────────────────────────────── */

/** `recent` (the last three months), a year (`2026`), or `all`. */
export function periodsFor(orders: readonly OrderSummaryDTO[]): Array<{ key: string; label: string }> {
  const years = [...new Set(orders.flatMap((o) => (o.placedAt ? [new Date(o.placedAt).getFullYear()] : [])))].sort((a, b) => b - a)
  return [
    { key: "recent", label: "Last 3 months" },
    ...years.map((y) => ({ key: String(y), label: String(y) })),
    { key: "all", label: "All time" },
  ]
}

export function inPeriod(o: OrderSummaryDTO, period: string, now: Date = new Date()): boolean {
  if (period === "all") return true
  // An order with no placed date is one that never completed; it is recent by definition of being shown.
  if (!o.placedAt) return period === "recent"
  const placed = new Date(o.placedAt)
  if (period === "recent") {
    const from = new Date(now)
    from.setMonth(from.getMonth() - 3)
    return placed >= from
  }
  return String(placed.getFullYear()) === period
}
