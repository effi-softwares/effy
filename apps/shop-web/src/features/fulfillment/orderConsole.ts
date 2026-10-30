import {
  DELIVERED_BY_WORDS,
  SHOP_ORDER_ATTENTION,
  SHOP_ORDER_DELIVERED_BY,
  SHOP_ORDER_PAYMENT_STATES,
  SHOP_ORDER_RANGES,
  SHOP_ORDER_SORTS,
  SHOP_ORDER_TABS,
  type ShopOrderAttention,
  type ShopOrderDetailDTO,
  type ShopOrderLineDTO,
  type ShopOrderListDTO,
  type ShopOrderListQuery,
  type DeliveredBy,
  type ShopOrderDeliveredBy,
  type ShopOrderPaymentState,
  type ShopOrderRange,
  type ShopOrderRowDTO,
  type ShopOrderSort,
  type ShopOrderTab,
  type FulfillmentStatus,
} from "@effy/shared-types"
import { defineListSearch, searchFilter, type ListState } from "@effy/web-kit/data-table"

export type OrderRow = ShopOrderRowDTO
export type OrderList = ShopOrderListDTO
export type OrderDetail = ShopOrderDetailDTO
export type OrderLine = ShopOrderLineDTO

export interface OrdersSearch {
  tab?: ShopOrderTab
  q?: string
  attention?: ShopOrderAttention
  payment?: ShopOrderPaymentState
  deliveredBy?: ShopOrderDeliveredBy
  range?: ShopOrderRange
  sort?: ShopOrderSort
  dir?: "asc" | "desc"
  page?: number
  /** Rows per page (103); 25 when absent. */
  size?: 25 | 50 | 100
  view?: "queue"
}

function pick<T extends string>(raw: unknown, allowed: readonly T[]): T | undefined {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined
}

export function validateOrdersSearch(raw: Record<string, unknown>): OrdersSearch {
  const out: OrdersSearch = {}
  const tab = pick(raw.tab, SHOP_ORDER_TABS)
  if (tab && tab !== "all") out.tab = tab
  if (typeof raw.q === "string" && raw.q.trim() !== "") out.q = raw.q.slice(0, 100)
  const attention = pick(raw.attention, SHOP_ORDER_ATTENTION)
  if (attention && attention !== "any") out.attention = attention
  const payment = pick(raw.payment, SHOP_ORDER_PAYMENT_STATES)
  if (payment) out.payment = payment
  const deliveredBy = pick(raw.deliveredBy, SHOP_ORDER_DELIVERED_BY)
  if (deliveredBy && deliveredBy !== "any") out.deliveredBy = deliveredBy
  const range = pick(raw.range, SHOP_ORDER_RANGES)
  if (range && range !== "any") out.range = range
  const sort = pick(raw.sort, SHOP_ORDER_SORTS)
  if (sort && sort !== "placed") out.sort = sort
  if (raw.dir === "asc") out.dir = "asc"
  const page = typeof raw.page === "number" ? raw.page : Number(raw.page)
  if (Number.isInteger(page) && page > 1) out.page = page
  const size = Number(raw.size)
  if (size === 50 || size === 100) out.size = size
  if (raw.view === "queue") out.view = "queue"
  return out
}

export function toListQuery(s: OrdersSearch): ShopOrderListQuery {
  const { view: _view, size, ...query } = validateOrdersSearch(s as Record<string, unknown>)
  return size ? { ...query, pageSize: size } : query
}

const without = <T extends string, D extends T>(values: readonly T[], drop: D) => values.filter((v): v is Exclude<T, D> => v !== drop)

/**
 * The order list's view as a console list (103): the SAME address keys as `validateOrdersSearch` (the
 * order pager and the CSV export read them too), so the shared table and the rest of the console agree.
 */
export type ShopOrderFilters = {
  tab: Exclude<ShopOrderTab, "all">
  attention: Exclude<ShopOrderAttention, "any">
  payment: ShopOrderPaymentState
  deliveredBy: Exclude<ShopOrderDeliveredBy, "any">
  range: Exclude<ShopOrderRange, "any">
}
export type ShopOrdersListState = ListState<ShopOrderSort, ShopOrderFilters>

export const shopOrdersList = defineListSearch<ShopOrderSort, ShopOrderFilters>({
  id: "orders",
  mode: "offset",
  sorts: SHOP_ORDER_SORTS,
  defaultSort: "placed",
  sortDir: { placed: "desc", number: "asc", customer: "asc", items: "desc", total: "desc" },
  filters: {
    tab: searchFilter.oneOf(without(SHOP_ORDER_TABS, "all")),
    attention: searchFilter.oneOf(without(SHOP_ORDER_ATTENTION, "any")),
    payment: searchFilter.oneOf(SHOP_ORDER_PAYMENT_STATES),
    deliveredBy: searchFilter.oneOf(without(SHOP_ORDER_DELIVERED_BY, "any")),
    range: searchFilter.oneOf(without(SHOP_ORDER_RANGES, "any")),
  },
})

export function isFiltered(s: OrdersSearch): boolean {
  return !!(s.q || s.attention || s.payment || s.deliveredBy || s.range)
}

export function activeFilterCount(s: OrdersSearch): number {
  return [s.range, s.payment, s.deliveredBy, s.attention].filter(Boolean).length
}

export const TAB_LABEL: Record<ShopOrderTab, string> = {
  all: "All",
  new: "Awaiting pick",
  picking: "Picking",
  ready_for_pickup: "Ready",
  collected: "Collected",
  delivered: "Delivered",
  unfulfillable: "Can't supply",
  withdrawn: "Cancelled",
}

export const PAYMENT_LABEL: Record<ShopOrderPaymentState, string> = {
  paid: "Paid",
  refund_pending: "Refund pending",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
}

export const DELIVERED_BY_FILTER_LABEL: Record<ShopOrderDeliveredBy, string> = {
  any: "Anyone",
  ...DELIVERED_BY_WORDS,
}

export const RANGE_LABEL: Record<ShopOrderRange, string> = {
  any: "Any time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
}

export function deliveredByText(d: DeliveredBy): string {
  return DELIVERED_BY_WORDS[d]
}

const RECENT_WINDOW_MS = 15 * 60_000

const TERMINAL: ReadonlySet<FulfillmentStatus> = new Set<FulfillmentStatus>([
  "collected",
  "delivered",
  "unfulfillable",
  "withdrawn",
])

export type OrderRowTone = "recent" | "unopened"

export function orderRowTone(row: Pick<OrderRow, "placedAt" | "status">, now: number): OrderRowTone | null {
  const placed = new Date(row.placedAt).getTime()
  if (!TERMINAL.has(row.status) && Number.isFinite(placed) && now - placed < RECENT_WINDOW_MS) {
    return "recent"
  }
  return row.status === "pending" ? "unopened" : null
}

export function formatPlacedShort(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "-"
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false })
    : d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })
}

export function formatMoney(amount: string, currency = "AUD"): string {
  const n = Number(amount)
  if (!Number.isFinite(n)) return "-"
  // Said as the product pages say it: "AUD 16.00".
  return `${currency} ${n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}`
}

export function formatWhen(iso: string | null): string {
  if (!iso) return "-"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "-"
  return d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

export function paymentMethodText(p: OrderDetail["payment"]): string {
  const brand = p.methodBrand ? p.methodBrand.charAt(0).toUpperCase() + p.methodBrand.slice(1) : null
  if (brand && p.methodLast4) return `${brand} •••• ${p.methodLast4}`
  if (brand) return brand
  if (p.methodType) return p.methodType.charAt(0).toUpperCase() + p.methodType.slice(1)
  return "Recorded at checkout"
}

export function refundableQuantity(line: Pick<OrderLine, "orderedQuantity" | "refundedQuantity">): number {
  return Math.max(0, line.orderedQuantity - line.refundedQuantity)
}

export function toCsv(rows: readonly OrderRow[]): string {
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = ["Order", "Customer", "Placed", "Status", "Payment", "Goes with", "Items", "Total", "Tags"]
  const body = rows.map((r) =>
    [
      r.orderNumber,
      r.customerName,
      r.placedAt,
      r.status,
      PAYMENT_LABEL[r.payment],
      deliveredByText(r.deliveredBy),
      r.itemCount,
      r.total,
      r.tags.join(" "),
    ]
      .map(esc)
      .join(","),
  )
  return [head.join(","), ...body].join("\n")
}

export type PickMode = "full" | "part" | "unavailable" | "none"

export function pickModeOf(
  l: Pick<OrderLine, "orderedQuantity" | "gatheredQuantity" | "unavailableQuantity">,
): PickMode {
  if (l.gatheredQuantity >= l.orderedQuantity && l.orderedQuantity > 0) return "full"
  if (l.gatheredQuantity > 0) return "part"
  if (l.unavailableQuantity > 0) return "unavailable"
  return "none"
}

export function pickLabel(
  l: Pick<OrderLine, "orderedQuantity" | "gatheredQuantity" | "unavailableQuantity" | "pickNote">,
): string {
  switch (pickModeOf(l)) {
    case "full":
      return "Picked"
    case "part":
      return `${l.gatheredQuantity} of ${l.orderedQuantity} picked`
    case "unavailable":
      return l.pickNote ? `Unavailable · ${l.pickNote}` : "Unavailable"
    case "none":
      return "Not picked"
  }
}

export function pickSummary(lines: readonly OrderLine[]): string {
  const full = lines.filter((l) => pickModeOf(l) === "full").length
  return `${full} of ${lines.length} ${lines.length === 1 ? "item" : "items"} picked`
}

export function unitsError(raw: string, ordered: number): string | null {
  if (raw.trim() === "" || !/^\d+$/.test(raw.trim())) return "Enter a number."
  const n = Number(raw)
  if (n < 1) return "Use Unavailable instead of 0."
  if (n > ordered) return `Only ${ordered} ordered.`
  return null
}

export function pickToast(name: string, mode: PickMode, units: number, ordered: number): string {
  switch (mode) {
    case "full":
      return `${name} - picked in full`
    case "part":
      return `${name} - ${units} of ${ordered} picked`
    case "unavailable":
      return `${name} - marked unavailable`
    case "none":
      return `${name} - picking cleared`
  }
}

export function canPick(status: OrderDetail["status"]): boolean {
  return status === "pending" || status === "received" || status === "picking"
}
