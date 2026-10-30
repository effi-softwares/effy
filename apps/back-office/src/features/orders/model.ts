import {
  DELIVERY_TYPE_WORDS,
  formatDeliveryDay,
  formatDeliveryWindow,
  type AdminOrderDeliveryFilter,
  type DeliveryPromise,
  type DeliveryType,
  type DeliveryTypeReason,
  type AdminOrderDetailDTO,
  type AdminOrderPackageDTO,
  type AdminOrderSummaryDTO,
  type OrderAwaiting,
  type PackageMilestoneDTO,
} from "@effy/shared-types"

export type OrderSummary = AdminOrderSummaryDTO
export type OrderDetail = AdminOrderDetailDTO
export type OrderPackage = AdminOrderPackageDTO

/** A quick read of the list outside its screen (the command palette, the overview's counts). */
export interface OrderListParams {
  q?: string
  status?: string
  deliveryType?: AdminOrderDeliveryFilter
  promise?: DeliveryPromise
}

export const PROMISE_LABEL: Record<DeliveryPromise, string> = {
  window: "A time",
  day: "Day only (any time)",
  asap: "As soon as possible",
}

export function deliveryTypeText(type: DeliveryType): string {
  return DELIVERY_TYPE_WORDS[type]
}

export const DELIVERY_FILTER_LABEL: Record<AdminOrderDeliveryFilter, string> = {
  effy: DELIVERY_TYPE_WORDS.effy,
  courier: DELIVERY_TYPE_WORDS.courier,
}

export const DELIVERY_REASON_LABEL: Record<DeliveryTypeReason, string> = {
  in_coverage: "The address is in Effy's delivery area",
  out_of_coverage: "The address is outside Effy's delivery area",
  no_window: "No Effy delivery window was available",
  staff_change: "Changed by staff",
}

export function packageDeliveryText(pkg: Pick<OrderPackage, "deliveredBy" | "deliveryMethod">): string {
  if (pkg.deliveredBy === "courier") return DELIVERY_TYPE_WORDS.courier
  const word = pkg.deliveryMethod === "same_day" ? "Same-day" : pkg.deliveryMethod === "standard" ? "Standard" : null
  return word ? `${DELIVERY_TYPE_WORDS.effy} · ${word}` : DELIVERY_TYPE_WORDS.effy
}

export const STAGE_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  packing: "Packing",
  on_the_way: "On the way",
  delivered: "Delivered",
}

type PackageAction = "handoff" | "arrival" | "none"

export { formatDeliveryDay } from "@effy/shared-types"

export function promiseTextFor(pkg: OrderPackage): string | null {
  if (!pkg.promisedDate) return null
  const day = formatDeliveryDay(pkg.promisedDate)
  return pkg.window ? `${day}, ${formatDeliveryWindow(pkg.window)}` : day
}

type PromiseFlag = "at_risk" | "late" | "on_time" | "over_capacity"

export function promiseFlagsFor(pkg: OrderPackage): PromiseFlag[] {
  const flags: PromiseFlag[] = []
  if (pkg.atRisk) flags.push("at_risk")
  if (pkg.onTime === false) flags.push("late")
  if (pkg.onTime === true) flags.push("on_time")
  if (pkg.overCapacity) flags.push("over_capacity")
  return flags
}

export const PROMISE_FLAG_LABEL: Record<PromiseFlag, string> = {
  at_risk: "At risk of missing its day",
  late: "Arrived late",
  on_time: "Arrived on time",
  over_capacity: "Slot over capacity",
}

export function nextActionFor(pkg: OrderPackage): PackageAction {
  if (pkg.arrival) return "none"
  if (pkg.status !== "collected") return "none"
  if (pkg.deliveredBy === "effy") return "none"
  return pkg.handoff ? "arrival" : "handoff"
}

export const AWAITING_LABEL: Record<OrderAwaiting, string> = {
  refund_decision: "Needs a refund decision",
  // A courier lost, damaged or returned a parcel, or could not deliver it.
  courier_problem: "Courier problem",
  handover: "Needs handover",
  arrival: "Awaiting arrival",
}

export const isPaid = (order: Pick<OrderDetail, "paymentStatus">): boolean =>
  order.paymentStatus === "succeeded" || order.paymentStatus === "paid"

/** Money on the order page, as product pages say it: "AUD 16.00". */
export const aud = (amount: string | number, currency = "AUD") => `${currency} ${Number(amount).toFixed(2)}`

/**
 * The order's progress in the customer's own words — the four steps of customer-web's order page
 * (`components/receipt/ProgressTrack.tsx`), so the preview shows what they see.
 */
export const CUSTOMER_STAGES: readonly { stage: OrderDetail["stage"]; label: string; note: string }[] = [
  { stage: "confirmed", label: "Confirmed", note: "We've received your payment" },
  { stage: "packing", label: "Being packed", note: "Your order is being picked" },
  { stage: "on_the_way", label: "On the way", note: "Out for delivery" },
  { stage: "delivered", label: "Delivered", note: "Your order has arrived" },
]

type JourneyStatus = PackageMilestoneDTO["status"]

/** The steps a package goes through, in order: an Effy driver's, a courier's via the hub, or one the courier collects from the shop. */
export function journeySteps(
  pkg: Pick<OrderPackage, "deliveredBy">,
  courierCollection: "hub" | "supplier" | null,
): JourneyStatus[] {
  if (pkg.deliveredBy === "effy") return ["preparing", "ready", "with_driver", "at_hub", "out_for_delivery", "delivered"]
  if (courierCollection === "supplier") return ["preparing", "ready", "with_carrier", "delivered"]
  return ["preparing", "ready", "with_driver", "at_hub", "with_carrier", "delivered"]
}

export interface JourneyStep {
  status: JourneyStatus
  state: "done" | "current" | "todo" | "problem"
  /** When it was reached; null for a step not reached. */
  at: string | null
  /** The problem's own words, on the step it stopped before. */
  note: string | null
}

/**
 * A package's journey: each step, whether it is done, where the package is now, and when each was reached. "Now" is
 * the package's status (the one status, 073); a problem or a cancellation sits on the step after the last one reached.
 */
export function journeyOf(
  pkg: Pick<OrderPackage, "deliveredBy" | "statusView" | "milestones">,
  courierCollection: "hub" | "supplier" | null,
): JourneyStep[] {
  const steps = journeySteps(pkg, courierCollection)
  const at = new Map(pkg.milestones.map((m) => [m.status, m.at]))
  const status = pkg.statusView?.status ?? null
  const reached = steps.reduce((last, s, i) => (at.has(s) ? i : last), 0)
  const here = status !== null && (steps as string[]).includes(status) ? (steps as string[]).indexOf(status) : reached
  const stuck = status === "problem" || status === "cancelled"
  const halt = stuck ? Math.min(reached + 1, steps.length - 1) : -1
  return steps.map((s, i) => ({
    status: s,
    state:
      i === halt
        ? "problem"
        : stuck
          ? i <= reached
            ? "done"
            : "todo"
          : i < here || (i === here && s === "delivered")
            ? "done"
            : i === here
              ? "current"
              : "todo",
    at: i <= (stuck ? reached : here) ? (at.get(s) ?? null) : null,
    note: i === halt ? (pkg.statusView?.detail ?? (status === "cancelled" ? "Cancelled" : null)) : null,
  }))
}
