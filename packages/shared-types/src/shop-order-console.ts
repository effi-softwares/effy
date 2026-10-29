import type { ListPage } from "./list"
/**
 * Shop order console contracts (the orders list and order detail). Separate from `./shop-order` (the
 * pick contract) because the console shows the order's money: total, paid, refunded. Still never: a
 * shop id in a request, the billing address, the customer's email or history, a capture action (capture
 * is automatic), or a tax line. Money is a 2-dp decimal string.
 */

import type { WireInt } from "./cart"
import type { RefundActorKind, RefundReason, RefundStatus } from "./refund"
import type { CourierPickupDTO, FulfillmentDeliveryDTO, FulfillmentStatus } from "./shop-order"
import type { PackageStatusView } from "./package-status"
import type { DeliveredBy } from "./delivery-type"
import type { ParcelCustody, ParcelZone } from "./parcels"

// The list

/** The status tabs. `new` is `pending` + `received` (nobody has started picking; `pending` lasts only until first opened). */
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

/** Where the order's money stands, derived from `public.refund`. `refund_pending` is with the provider, not yet settled. */
export const SHOP_ORDER_PAYMENT_STATES = [
  "paid",
  "refund_pending",
  "partially_refunded",
  "refunded",
] as const
export type ShopOrderPaymentState = (typeof SHOP_ORDER_PAYMENT_STATES)[number]

/** The "Status" filter: the attention a row needs, apart from the lifecycle tabs. */
export const SHOP_ORDER_ATTENTION = ["any", "at_risk", "short", "on_track"] as const
export type ShopOrderAttention = (typeof SHOP_ORDER_ATTENTION)[number]

/** The "Fulfilment" filter: who takes the package away. */
export const SHOP_ORDER_DELIVERED_BY = ["any", "effy_driver", "courier"] as const
export type ShopOrderDeliveredBy = (typeof SHOP_ORDER_DELIVERED_BY)[number]

export const SHOP_ORDER_RANGES = ["any", "today", "7d", "30d"] as const
export type ShopOrderRange = (typeof SHOP_ORDER_RANGES)[number]

export const SHOP_ORDER_SORTS = ["placed", "number", "customer", "items", "total"] as const
export type ShopOrderSort = (typeof SHOP_ORDER_SORTS)[number]

/** GET /shop/v1/orders query. Every field optional; an unrecognised value is its default. */
export interface ShopOrderListQuery {
  tab?: ShopOrderTab
  q?: string
  attention?: ShopOrderAttention
  payment?: ShopOrderPaymentState | "any"
  deliveredBy?: ShopOrderDeliveredBy
  range?: ShopOrderRange
  sort?: ShopOrderSort
  dir?: "asc" | "desc"
  /** 1-based. */
  page?: number
  /** Rows per page (103): 25, 50 or 100. */
  pageSize?: 25 | 50 | 100
}

// Collection (099)

/**
 * Where the Effy collection run's driver is, as far as one shop is concerned: no round yet, a driver
 * given the run, set off (the round is open and the driver on duty), or collected from this shop.
 * Never a name, a position or another stop.
 */
export const COLLECTION_DRIVER_STATES = ["none", "assigned", "on_the_way", "collected"] as const
export type CollectionDriver = (typeof COLLECTION_DRIVER_STATES)[number]

/** One Effy collection run as a shop sees it. */
export interface ShopCollectionRunDTO {
  /** The run's instant. */
  runAt: string
  /** 0 today, 1 tomorrow… in the shop's timezone. */
  dayOffset: WireInt
  driver: CollectionDriver
  /** When the run's round opens to its driver; null while no round exists. The screen words "on the way" from it. */
  opensAt: string | null
  driverOnDuty: boolean
}

/** Today's "Next collection": the run, and this shop's Effy orders due on it. */
export interface ShopNextCollectionDTO extends ShopCollectionRunDTO {
  due: { ready: WireInt; picking: WireInt }
}

/** The run expected to collect an Effy-driver package still at the shop. A courier package never has one. */
export interface ShopOrderCollectionDTO {
  runAt: string
  dayOffset: WireInt
  driver: CollectionDriver
}

/** A line's temperature, from the item at checkout. Pick lists run Ambient → Chilled → Frozen. */
export const STORAGE_CLASSES = ["ambient", "chilled", "frozen"] as const
export type StorageClass = (typeof STORAGE_CLASSES)[number]
export const STORAGE_CLASS_WORDS: Record<StorageClass, string> = {
  ambient: "Ambient",
  chilled: "Chilled",
  frozen: "Frozen",
}

/** One row. `id` is the portion (shop_fulfillment.id), which the detail route is keyed on. */
export interface ShopOrderRowDTO {
  id: string
  orderNumber: string
  /** The delivery snapshot's recipient: the only customer identity a shop holds. */
  customerName: string
  placedAt: string
  status: FulfillmentStatus
  /** Where the package really is, in the staff words (At hub, Out for delivery…); `status` is the shop's own step. `driverName` is always null here. */
  statusView: PackageStatusView
  /** This shop's units on the order. */
  itemCount: WireInt
  gatheredCount: WireInt
  unavailableCount: WireInt
  /** Who takes this package away: the only delivery fact a shop is told (never a window, day, estimate or fee). */
  deliveredBy: DeliveredBy
  /** Present only when a courier collects this package from the shop. */
  courierPickup?: CourierPickupDTO
  /** Present only for an Effy-driver package still at the shop: the run expected to collect it (099). */
  collection?: ShopOrderCollectionDTO
  /** Open and within 15 minutes of, or past, its ready-by. */
  atRisk: boolean
  payment: ShopOrderPaymentState
  /** The order's grand total. */
  total: string
  currency: string
  tags: string[]
  /** "Eggs ×2, Oat milk ×1": this shop's lines, for the Items column. */
  itemsSummary: string
}

/** Per-tab counts over every state, under every filter but the tab. */
export type ShopOrderCounts = Record<ShopOrderTab, WireInt>

/** The shop's orders as a console list page (103), with every tab's count under the filters. */
export interface ShopOrderListDTO extends ListPage<ShopOrderRowDTO> {
  counts: ShopOrderCounts
}

// The detail

/** One of this shop's lines, priced from the receipt snapshot. */
export interface ShopOrderLineDTO {
  orderItemId: string
  name: string
  /** The variant's label as sold ("1 kg"); null with no options. */
  variantLabel: string | null
  /** Effy's code for the variant as sold (V + 6). */
  variantCode: string | null
  /** The shop's own stock code as sold. */
  sku: string | null
  /** The variant's barcode as sold, so a picker can check the item in hand. */
  gtin: string | null
  imageUrl: string | null
  orderedQuantity: WireInt
  gatheredQuantity: WireInt
  unavailableQuantity: WireInt
  /** Units covered by a refund that did not fail or get refused. */
  refundedQuantity: WireInt
  unitPrice: string
  lineTotal: string
  /** The picker's note from "Adjust this line". */
  pickNote: string | null
  /** Ambient, chilled or frozen: groups the pick list in walking order (099). */
  storageClass: StorageClass
}

/** One refund on the order, any issuer, so the shop sees money Effy returned too. */
export interface ShopOrderRefundDTO {
  id: string
  amount: string
  status: RefundStatus
  reason: RefundReason
  actorKind: RefundActorKind
  /** Resolved from shop or back-office staff; `null` when unattributable. */
  actorLabel: string | null
  createdAt: string
}

export interface ShopOrderMoneyDTO {
  currency: string
  /** This shop's lines: Σ lineTotal. */
  shopSubtotal: string
  /** The order's item subtotal; exceeds `shopSubtotal` when other shops supplied part. */
  itemSubtotal: string
  // No delivery fee: a shop never sees what the customer paid for delivery (`shop-order.guard`).
  discount: string
  total: string
  /** Refunds that settled. */
  refunded: string
  /** Refunds with the provider, not yet settled. */
  refundPending: string
  /** total − refunded. */
  net: string
}

export interface ShopOrderPaymentDTO {
  state: ShopOrderPaymentState
  /** e.g. "card"; `null` when not recorded. */
  methodType: string | null
  methodBrand: string | null
  methodLast4: string | null
  /** The amount authorised, which with automatic capture is also what was captured. */
  amount: string
  paidAt: string | null
}

/** What happened to the package after it left the shelf. */
export interface ShopOrderHandoffDTO {
  /** ISO: when it reached the customer. */
  deliveredAt: string | null
  /** The shop's own words when it declared the portion unsuppliable. */
  unfulfillableReason: string | null
}

export interface ShopOrderNoteDTO {
  id: string
  body: string
  authorLabel: string | null
  createdAt: string
}

/** One bag of this package, for its label and the pack step. `custody` never names a driver; "printed" means since its number or zone last changed. */
export interface ShopParcelLabelDTO {
  parcelId: string
  code: string
  seq: WireInt
  of: WireInt
  zone: ParcelZone
  printed: { count: WireInt; firstAt: string | null; lastAt: string | null; current: boolean }
  packScanned: { at: string; by: string | null } | null
  custody: ParcelCustody
}

/** What every bag's label shares: the recipient and full address (the shop already sees both). Never a window, day, estimate, price, phone or email. */
export interface ShopLabelCommonDTO {
  service: DeliveredBy
  orderNumber: string
  /** The day the first label was printed, or null before any (the label then shows today). */
  packedOn: string | null
  /** The shipping address in full and the recipient's phone; never the billing address. */
  recipientName: string
  line1: string
  line2: string | null
  suburb: string
  state: string
  postcode: string
  /** As stored (`AU`); the label words it. */
  country: string | null
  phone: string | null
}

export interface ShopOrderDetailDTO {
  id: string
  orderId: string
  orderNumber: string
  placedAt: string
  status: FulfillmentStatus
  /** See `ShopOrderRowDTO.statusView`. Never a driver's name. */
  statusView: PackageStatusView
  stateChangedAt: string
  readyBy: string
  /** Who takes this package away: the only delivery fact a shop is told. */
  deliveredBy: DeliveredBy
  /** Present only when a courier collects this package from the shop. */
  courierPickup?: CourierPickupDTO
  /** Present only for an Effy-driver package still at the shop: the run expected to collect it (099). */
  collection?: ShopOrderCollectionDTO
  atRisk: boolean
  delivery: FulfillmentDeliveryDTO
  /** This package's live bags, each with its own label. */
  parcels: ShopParcelLabelDTO[]
  /** What every bag's label shares. */
  labelCommon: ShopLabelCommonDTO
  /** The cold zones this package's lines need a bag for (a declaration without one is refused). */
  zonesNeeded: ParcelZone[]
  /** Back-office requires every bag to be scanned as packed before the order can be ready. */
  packScanRequired: boolean
  lines: ShopOrderLineDTO[]
  money: ShopOrderMoneyDTO
  payment: ShopOrderPaymentDTO
  refunds: ShopOrderRefundDTO[]
  handoff: ShopOrderHandoffDTO
  tags: string[]
  notes: ShopOrderNoteDTO[]
}

/** POST /shop/v1/orders/{id}/picks: item-level picking. `full` ticks the line, `none` clears it, `part` records `units` picked (the rest is short), `unavailable` none. */
export interface ShopOrderPicksRequest {
  lines: {
    orderItemId: string
    mode: "full" | "part" | "unavailable" | "none"
    units?: WireInt
    note?: string
  }[]
}

/** Tag limits, shared so the console refuses what the service refuses. */
export const SHOP_ORDER_TAG_MAX = 10
export const SHOP_ORDER_TAG_MAX_LENGTH = 32
export const SHOP_ORDER_NOTE_MAX_LENGTH = 2000
