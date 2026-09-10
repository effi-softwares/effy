import {
  SHOP_ORDER_ATTENTION,
  SHOP_ORDER_METHODS,
  SHOP_ORDER_PAYMENT_STATES,
  SHOP_ORDER_RANGES,
  SHOP_ORDER_SORTS,
  SHOP_ORDER_TABS,
  type ShopOrderActivityDTO,
  type ShopOrderActivityEntryDTO,
  type ShopOrderAttention,
  type ShopOrderDetailDTO,
  type ShopOrderLineDTO,
  type ShopOrderListDTO,
  type ShopOrderListQuery,
  type ShopOrderMethod,
  type ShopOrderPaymentState,
  type ShopOrderRange,
  type ShopOrderRefundDTO,
  type ShopOrderRowDTO,
  type ShopOrderSort,
  type ShopOrderTab,
} from "@effy/shared-types"

/**
 * The shop ORDER CONSOLE's domain (057 Amendment A3) — the list's URL state, the labels, and money
 * formatting. Pure: no React, no transport.
 *
 * ⚠ THE LIST'S STATE LIVES IN THE URL, NOT IN COMPONENT STATE. Clicking a row opens the order and the
 * back button must land on the SAME filtered, sorted page — and the order detail's previous/next
 * needs to know which list it was opened from. A URL answers both; `useState` answers neither.
 */

export type OrderRow = ShopOrderRowDTO
export type OrderList = ShopOrderListDTO
export type OrderDetail = ShopOrderDetailDTO
export type OrderLine = ShopOrderLineDTO
export type OrderRefund = ShopOrderRefundDTO
export type OrderActivity = ShopOrderActivityDTO
export type OrderActivityEntry = ShopOrderActivityEntryDTO

/** The list's search params. Every key optional — absent means "the default". */
export interface OrdersSearch {
  tab?: ShopOrderTab
  q?: string
  attention?: ShopOrderAttention
  payment?: ShopOrderPaymentState
  method?: ShopOrderMethod
  range?: ShopOrderRange
  sort?: ShopOrderSort
  dir?: "asc" | "desc"
  page?: number
}

function pick<T extends string>(raw: unknown, allowed: readonly T[]): T | undefined {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined
}

/**
 * Parse the URL into search params. ⚠ INVALID AND DEFAULT VALUES ARE DROPPED, not kept: a URL carrying
 * `tab=all&page=1` is the same list as a bare `/orders`, and two URLs for one list would cache twice.
 */
export function validateOrdersSearch(raw: Record<string, unknown>): OrdersSearch {
  const out: OrdersSearch = {}
  const tab = pick(raw.tab, SHOP_ORDER_TABS)
  if (tab && tab !== "all") out.tab = tab
  if (typeof raw.q === "string" && raw.q.trim() !== "") out.q = raw.q.slice(0, 100)
  const attention = pick(raw.attention, SHOP_ORDER_ATTENTION)
  if (attention && attention !== "any") out.attention = attention
  const payment = pick(raw.payment, SHOP_ORDER_PAYMENT_STATES)
  if (payment) out.payment = payment
  const method = pick(raw.method, SHOP_ORDER_METHODS)
  if (method && method !== "any") out.method = method
  const range = pick(raw.range, SHOP_ORDER_RANGES)
  if (range && range !== "any") out.range = range
  const sort = pick(raw.sort, SHOP_ORDER_SORTS)
  if (sort && sort !== "placed") out.sort = sort
  if (raw.dir === "desc") out.dir = "desc"
  const page = typeof raw.page === "number" ? raw.page : Number(raw.page)
  if (Number.isInteger(page) && page > 1) out.page = page
  return out
}

/** The API query for a search. Only non-default keys are sent, so equal lists share a cache entry. */
export function toListQuery(s: OrdersSearch): ShopOrderListQuery {
  return validateOrdersSearch(s as Record<string, unknown>)
}

/** Whether anything narrows the list beyond the tab — what separates "no orders yet" from "no match". */
export function isFiltered(s: OrdersSearch): boolean {
  return !!(s.q || s.attention || s.payment || s.method || s.range)
}

/** Drop every filter and the search, keeping the tab and sort the operator chose. */
export function clearedFilters(s: OrdersSearch): OrdersSearch {
  return validateOrdersSearch({ tab: s.tab, sort: s.sort, dir: s.dir })
}

// ── Saved views ─────────────────────────────────────────────────────────────────────────────────

/**
 * The saved views — named filter presets beside the status tabs.
 *
 * ⚠ DERIVED, NOT STORED. A view is "active" when the current filters equal its preset exactly, so
 * there is no second piece of state to fall out of step with the URL: change one filter by hand and
 * the view correctly stops claiming to be selected.
 */
export const SAVED_VIEWS: readonly { id: string; label: string; search: OrdersSearch }[] = [
  // The design's five, in its order. "Paid, unfulfilled" and "High value" have no Effy meaning (every
  // order a shop sees is paid; there is no value threshold the platform defines), so their slots carry
  // the two views a shop floor actually needs: same-day work and shortfalls.
  { id: "all", label: "All orders", search: {} },
  { id: "needs-picking", label: "Needs picking", search: { tab: "new" } },
  { id: "same-day", label: "Same-day", search: { method: "same_day" } },
  { id: "short", label: "Short items", search: { attention: "short" } },
  { id: "attention", label: "Needs attention", search: { attention: "at_risk" } },
]

const VIEW_KEYS = ["tab", "q", "attention", "payment", "method", "range"] as const

export function activeViewId(s: OrdersSearch): string | null {
  const view = SAVED_VIEWS.find((v) => VIEW_KEYS.every((k) => (v.search[k] ?? undefined) === (s[k] ?? undefined)))
  return view?.id ?? null
}

/** Apply a view: its filters replace the current ones; the sort the operator chose survives. */
export function applyView(s: OrdersSearch, view: OrdersSearch): OrdersSearch {
  return validateOrdersSearch({ ...view, sort: s.sort, dir: s.dir })
}

// ── Labels ──────────────────────────────────────────────────────────────────────────────────────

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

export const ATTENTION_LABEL: Record<ShopOrderAttention, string> = {
  any: "Any status",
  at_risk: "At risk",
  short: "Short items",
  on_track: "On track",
}

export const METHOD_LABEL: Record<ShopOrderMethod, string> = {
  any: "Any method",
  same_day: "Same-day",
  standard: "Standard",
}

export const RANGE_LABEL: Record<ShopOrderRange, string> = {
  any: "Any time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
}

export function methodText(m: "same_day" | "standard" | null): string {
  if (m === "same_day") return "Same-day"
  if (m === "standard") return "Standard"
  return "—"
}

// ── Formatting ──────────────────────────────────────────────────────────────────────────────────

/**
 * The list's Placed column, as the design has it: the time for today's orders, the day otherwise.
 */
export function formatPlacedShort(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false })
    : d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })
}

/** A decimal-string amount as currency. The wire value is never parsed into arithmetic here. */
export function formatMoney(amount: string, currency = "AUD"): string {
  const n = Number(amount)
  if (!Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n)
}

/** "10 Sep, 2:14 pm" — the list's placed column and every log line. */
export function formatWhen(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

/** The payment method in words: "Visa •••• 4242", or "Card" when the brand was not recorded. */
export function paymentMethodText(p: OrderDetail["payment"]): string {
  const brand = p.methodBrand ? p.methodBrand.charAt(0).toUpperCase() + p.methodBrand.slice(1) : null
  if (brand && p.methodLast4) return `${brand} •••• ${p.methodLast4}`
  if (brand) return brand
  if (p.methodType) return p.methodType.charAt(0).toUpperCase() + p.methodType.slice(1)
  return "Recorded at checkout"
}

/** Units of a line that can still be refunded — ordered, minus what is already on its way back. */
export function refundableQuantity(line: Pick<OrderLine, "orderedQuantity" | "refundedQuantity">): number {
  return Math.max(0, line.orderedQuantity - line.refundedQuantity)
}

/** CSV for the current list — one row per order, the columns the table shows. */
export function toCsv(rows: readonly OrderRow[]): string {
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = ["Order", "Customer", "Placed", "Status", "Payment", "Method", "Items", "Total", "Tags"]
  const body = rows.map((r) =>
    [
      r.orderNumber,
      r.customerName,
      r.placedAt,
      r.status,
      PAYMENT_LABEL[r.payment],
      methodText(r.deliveryMethod),
      r.itemCount,
      r.total,
      r.tags.join(" "),
    ]
      .map(esc)
      .join(","),
  )
  return [head.join(","), ...body].join("\n")
}
