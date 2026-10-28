import {
  DELIVERY_TYPE_WORDS,
  formatDeliveryDay,
  formatDeliveryWindow,
  type AdminOrderDeliveryFilter,
  type DeliveryPromise,
  type DeliveryType,
  type DeliveryTypeChangeDTO,
  type DeliveryTypeReason,
  type AdminOrderDetailDTO,
  type AdminOrderHistoryEntryDTO,
  type AdminOrderPackageDTO,
  type AdminOrderSummaryDTO,
  type OrderAwaiting,
} from "@effy/shared-types"

export type OrderSummary = AdminOrderSummaryDTO
export type OrderDetail = AdminOrderDetailDTO
export type OrderPackage = AdminOrderPackageDTO
export type OrderHistoryEntry = AdminOrderHistoryEntryDTO

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

export function deliveryChangeText(c: DeliveryTypeChangeDTO): string {
  return c.from ? `${DELIVERY_TYPE_WORDS[c.from]} → ${DELIVERY_TYPE_WORDS[c.to]}` : DELIVERY_TYPE_WORDS[c.to]
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
