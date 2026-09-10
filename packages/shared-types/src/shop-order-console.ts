/**
 * Shop ORDER CONSOLE contracts — 057 Amendment A3 (shop-web orders list + order detail).
 *
 * ⚠ A SEPARATE FAMILY FROM ./shop-order, ON PURPOSE. `./shop-order` is the PICK contract that both
 * shop surfaces read (shop-mobile decodes it through a generated Kotlin mirror), and its header states
 * a rule this family deliberately relaxes: under A3 the operator decided a shop's order console shows
 * the ORDER's money — its total, what was paid, what has been refunded. Putting those fields on the
 * pick DTOs would change the mobile contract and silently widen a rule the pick screen still keeps.
 * So the console gets its own routes (`/shop/v1/orders…`) and its own shapes, and the pick routes are
 * byte-for-byte what they were.
 *
 * ⚠ WHAT STILL DOES NOT CROSS, EVEN HERE:
 *  - NO shop identifier in any request — scope is resolved server-side from the operator's record.
 *  - NO billing address (023 FR-018) and NO customer email / account history. The shop reaches the
 *    person it delivers to through the delivery snapshot's name and phone, which is all it needs.
 *  - NO capture action. Effy captures at payment (`CaptureMethod: automatic`, 055 R3), so there is no
 *    "authorised but not captured" state for a button to act on.
 *  - NO tax line. Australian grocery is a mixed GST supply and per-item GST treatment is unmodelled
 *    (052 R13), so any "tax" figure here would be invented.
 *
 * Money crosses as a 2-dp decimal STRING (e.g. "57.80"), never a float — the platform-wide rule.
 */

import type { WireInt } from "./cart"
import type { RefundActorKind, RefundReason, RefundStatus } from "./refund"
import type { FulfillmentDeliveryDTO, FulfillmentStatus } from "./shop-order"

// ── The list ────────────────────────────────────────────────────────────────────────────────────

/**
 * The status tabs. `new` is `pending` + `received` together: both mean "nobody has started picking",
 * and `pending` lasts only until the first open (020 FR-011a), so a tab of its own would be a tab that
 * empties itself whenever someone looks at it.
 */
export const SHOP_ORDER_TABS = [
  "all",
  "new",
  "picking",
  "ready_for_pickup",
  "collected",
  "delivered",
  "unfulfillable",
  "withdrawn",
] as const
export type ShopOrderTab = (typeof SHOP_ORDER_TABS)[number]

/**
 * Where the order's money stands, DERIVED on read from `public.refund` — never stored (027's
 * counted-not-stored rule). `refund_pending` means a refund is with the provider and has not settled;
 * 055 is explicit that "submitted" is not "returned", so it is not reported as refunded yet.
 */
export const SHOP_ORDER_PAYMENT_STATES = [
  "paid",
  "refund_pending",
  "partially_refunded",
  "refunded",
] as const
export type ShopOrderPaymentState = (typeof SHOP_ORDER_PAYMENT_STATES)[number]

/** The "Status" filter — the attention a row needs, orthogonal to the lifecycle tabs. */
export const SHOP_ORDER_ATTENTION = ["any", "at_risk", "short", "on_track"] as const
export type ShopOrderAttention = (typeof SHOP_ORDER_ATTENTION)[number]

/** The "Fulfilment" filter — how the package leaves the shop's hands (047/049). */
export const SHOP_ORDER_METHODS = ["any", "same_day", "standard"] as const
export type ShopOrderMethod = (typeof SHOP_ORDER_METHODS)[number]

export const SHOP_ORDER_RANGES = ["any", "today", "7d", "30d"] as const
export type ShopOrderRange = (typeof SHOP_ORDER_RANGES)[number]

export const SHOP_ORDER_SORTS = ["placed", "number", "customer", "items", "total"] as const
export type ShopOrderSort = (typeof SHOP_ORDER_SORTS)[number]

/**
 * GET /shop/v1/orders query. Every field optional; an unrecognised value is treated as its default
 * (never as "match everything differently"), exactly as the pick queue treats `state`.
 */
export interface ShopOrderListQuery {
  tab?: ShopOrderTab
  q?: string
  attention?: ShopOrderAttention
  payment?: ShopOrderPaymentState | "any"
  method?: ShopOrderMethod
  range?: ShopOrderRange
  sort?: ShopOrderSort
  dir?: "asc" | "desc"
  /** 1-based. */
  page?: number
}

/** One row. `id` is the PORTION (shop_fulfillment.id) — the detail route is keyed on it. */
export interface ShopOrderRowDTO {
  id: string
  orderNumber: string
  /** The delivery snapshot's recipient — the only customer identity a shop holds. */
  customerName: string
  placedAt: string
  status: FulfillmentStatus
  /** This shop's units on the order. */
  itemCount: WireInt
  gatheredCount: WireInt
  unavailableCount: WireInt
  /** `null` for orders placed before 047 recorded a method. */
  deliveryMethod: "same_day" | "standard" | null
  /** Open (pending/received/picking) and within 15 minutes of — or past — its ready-by. */
  atRisk: boolean
  payment: ShopOrderPaymentState
  /** The order's grand total (A3). */
  total: string
  currency: string
  tags: string[]
}

/** Per-tab counts over EVERY state, under every filter except the tab itself. */
export type ShopOrderCounts = Record<ShopOrderTab, WireInt>

export interface ShopOrderListDTO {
  items: ShopOrderRowDTO[]
  /** Rows matching tab + filters, across all pages. */
  total: WireInt
  page: WireInt
  pageSize: WireInt
  counts: ShopOrderCounts
}

// ── The detail ──────────────────────────────────────────────────────────────────────────────────

/** One of this shop's lines, priced from the receipt snapshot (019). */
export interface ShopOrderLineDTO {
  orderItemId: string
  name: string
  sku: string | null
  imageUrl: string | null
  orderedQuantity: WireInt
  gatheredQuantity: WireInt
  unavailableQuantity: WireInt
  /** Units already covered by a refund that did not fail or get refused. */
  refundedQuantity: WireInt
  unitPrice: string
  lineTotal: string
}

/** One refund on the order — any issuer, so the shop sees money Effy returned too. */
export interface ShopOrderRefundDTO {
  id: string
  amount: string
  status: RefundStatus
  reason: RefundReason
  actorKind: RefundActorKind
  /** Resolved from shop staff or back-office staff; `null` when the issuer is unattributable. */
  actorLabel: string | null
  createdAt: string
}

export interface ShopOrderMoneyDTO {
  currency: string
  /** This shop's lines — Σ lineTotal. */
  shopSubtotal: string
  /** The order's item subtotal; exceeds `shopSubtotal` when other shops supplied part of it. */
  itemSubtotal: string
  deliveryFee: string
  discount: string
  promoCode: string | null
  total: string
  /** Refunds that SETTLED. */
  refunded: string
  /** Refunds with the provider, not yet settled. */
  refundPending: string
  /** total − refunded. */
  net: string
}

export interface ShopOrderPaymentDTO {
  state: ShopOrderPaymentState
  /** e.g. "card". `null` on orders paid before 052 recorded the method. */
  methodType: string | null
  methodBrand: string | null
  methodLast4: string | null
  /** The amount the customer authorised — and, because capture is automatic, also what was captured. */
  amount: string
  paidAt: string | null
}

/** What happened to the package after it left the shelf (049 collection, 053 arrival). */
export interface ShopOrderHandoffDTO {
  /** ISO — when an Effy driver collected it. */
  collectedAt: string | null
  /** ISO — when it reached the customer. */
  deliveredAt: string | null
  /** The shop's own words when it declared the portion unsuppliable (055 US6). */
  unfulfillableReason: string | null
}

export interface ShopOrderNoteDTO {
  id: string
  body: string
  authorLabel: string | null
  createdAt: string
}

export interface ShopOrderDetailDTO {
  id: string
  orderId: string
  orderNumber: string
  placedAt: string
  status: FulfillmentStatus
  stateChangedAt: string
  readyBy: string
  deliveryMethod: "same_day" | "standard" | null
  atRisk: boolean
  delivery: FulfillmentDeliveryDTO
  lines: ShopOrderLineDTO[]
  money: ShopOrderMoneyDTO
  payment: ShopOrderPaymentDTO
  refunds: ShopOrderRefundDTO[]
  handoff: ShopOrderHandoffDTO
  tags: string[]
  notes: ShopOrderNoteDTO[]
}

// ── The activity log ────────────────────────────────────────────────────────────────────────────

/**
 * One log entry. `tone` drives the entry's dot: `strong` for events that needed or took a decision
 * (a shortfall, a refund, can't-supply), `quiet` for routine progress.
 */
export interface ShopOrderActivityEntryDTO {
  id: string
  at: string
  title: string
  actorLabel: string | null
  tone: "strong" | "quiet"
}

export interface ShopOrderActivityDTO {
  entries: ShopOrderActivityEntryDTO[]
}

// ── Writes ──────────────────────────────────────────────────────────────────────────────────────

/** PUT /shop/v1/orders/{id}/tags — the ABSOLUTE set, so a retry is idempotent. */
export interface ShopOrderTagsRequest {
  tags: string[]
}

/** POST /shop/v1/orders/{id}/notes. */
export interface ShopOrderNoteRequest {
  body: string
}

/** Tag limits, shared so the console refuses exactly what the service refuses. */
export const SHOP_ORDER_TAG_MAX = 10
export const SHOP_ORDER_TAG_MAX_LENGTH = 32
export const SHOP_ORDER_NOTE_MAX_LENGTH = 2000
