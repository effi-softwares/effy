/**
 * Shop console Today and Insights. Two payloads on purpose: `ShopTodayDTO` is live state, `ShopInsightsDTO`
 * prepared figures from rollups. "Awaiting pick" and "Unfulfilled units" appear on both screens from
 * `ShopTodayDTO.backlog` only. No shop id in any request, no customer email or history, no other shop's
 * portion, no tax line. Money is a 2-dp decimal string.
 */

import type { WireInt } from "./cart"
import type { DeliveredBy } from "./delivery-type"
import type { CourierPickupDTO } from "./shop-order"
import type { ShopNextCollectionDTO, StorageClass } from "./shop-order-console"

// Today: the live snapshot

export const TODAY_EVENT_LIMIT = 12

/**
 * One thing waiting on a person, in the order to look at them. A discriminated union, so each kind
 * carries only its own facts; the wording is the client's.
 */
export type ShopAttentionItemDTO =
  | {
    kind: "awaiting_pick"
    orders: WireInt
    units: WireInt
    /** The oldest waiting order's paid instant ("oldest 3 h 12 m"). */
    since: string
  }
  | {
    kind: "out_of_stock"
    productId: string
    /** The size that is out; `name` already says which ("Rice - 1 kg"). */
    variantId: string
    name: string
    /** Units sold in the last 7 days: demand the platform knows (it records no product views). */
    soldLast7Days: WireInt
    since: string
  }
  | {
    kind: "low_stock"
    productId: string
    /** The size that is low. */
    variantId: string
    name: string
    onHand: WireInt
    /** Null with no recorded sales: cover cannot be derived from no demand. */
    daysOfCover: WireInt | null
    since: string
  }
  | {
    kind: "refund_proposed"
    fulfillmentId: string
    orderNumber: string
    amount: string
    since: string
  }

/**
 * One thing that happened at this shop today, newest first in `ShopTodayDTO.events`. The wording is the client's.
 * `collected` is one driver or courier hand-over, however many orders it took.
 */
export type ShopTodayEventDTO = { id: string; at: string } & (
  | {
    kind: "came_in"
    fulfillmentId: string
    orderNumber: string
    /** Units on this shop's lines. */
    itemCount: WireInt
    /** Who takes this package away: the only delivery fact a shop is told. */
    deliveredBy: DeliveredBy
  }
  | {
    kind: "picking" | "ready" | "cant_supply" | "cancelled" | "delivered"
    fulfillmentId: string
    orderNumber: string
  }
  | {
    kind: "collected"
    orders: WireInt
    /** The order, when the hand-over took just one. */
    fulfillmentId: string | null
    orderNumber: string | null
  }
  | {
    kind: "sold_out" | "restocked"
    productId: string
    variantId: string
    name: string
  }
)

/**
 * What is still to come today, soonest first: this shop's collection runs, and when its orders usually arrive on this
 * weekday. A usual time is sent only with enough weeks behind it to mean something.
 */
export type ShopTodayAheadDTO = { at: string } & (
  | {
    kind: "run"
    /** This shop's orders on the run so far. */
    orders: WireInt
  }
  | { kind: "orders_start" | "busiest" }
)

export interface ShopBacklogDTO {
  /** The one value every backlog figure renders from (needs attention, badges, glance cells, Insights). */
  awaitingPick: {
    orders: WireInt
    units: WireInt
    oldestPaidAt: string | null
  }
  readyForPickup: WireInt
  lowStock: {
    skus: WireInt
    outOfStock: WireInt
  }
}

export interface ShopTodayDTO {
  /** The server's clock; the date is formatted in the shop's timezone, so a wrong browser clock cannot shift the day. */
  now: string
  /** IANA zone name: the shop's day, hours and weeks. */
  timezone: string
  backlog: ShopBacklogDTO
  /** At most 8, ordered: awaiting pick → out of stock → refunds → low stock, oldest first. */
  attention: ShopAttentionItemDTO[]
  /** Open items beyond the 8 shown. */
  attentionMore: WireInt
  /** The oldest open item's instant: "Oldest item waiting {age}". Null when nothing waits. */
  oldestWaitingAt: string | null
  /** Today's events on Effy's clock, newest first: at most `TODAY_EVENT_LIMIT`. */
  events: ShopTodayEventDTO[]
  ahead: ShopTodayAheadDTO[]
  /** Yesterday's close; null when the shop sold nothing. `revenue` is its goods less refunds, as Insights counts it. */
  yesterday: { orders: WireInt; revenue: string } | null
  /** The next Effy collection run to reach this shop; null when no collection runs are set up (099). */
  nextCollection: ShopNextCollectionDTO | null
}

// Insights: prepared figures

export const INSIGHTS_RANGES = ["today", "7d", "30d"] as const
export type InsightsRange = (typeof INSIGHTS_RANGES)[number]

/** What a figure is compared with. "today" compares with the same weekday last week up to the same local time. */
export const COMPARISON_BASES = [
  "same_weekday_last_week",
  "previous_7_days",
  "previous_30_days",
] as const
export type ComparisonBasis = (typeof COMPARISON_BASES)[number]

/**
 * A figure and what it is measured against. The server computes the change; the client only formats it.
 * `kind: "none"` means there is nothing to compare against, and the UI says so.
 */
export interface InsightsFigureDTO {
  /** Money as a 2-dp decimal string; counts as an integer string. */
  value: string
  previous: string | null
  change: {
    kind: "pct" | "abs" | "none"
    /** Signed. Null when kind is "none". */
    amount: string | null
  }
}

export interface InsightsBucketDTO {
  /** Bucket start: the UTC moment the local hour, day or week began. */
  start: string
  /** The mono axis label: "14", "Mon 8", "W35". */
  label: string
  /** A week (or day) cut short by the window's edge. */
  partial: boolean
  revenue: string
  orders: WireInt
  /** The same point of the comparison window; null when the comparison is shorter (a day still running). */
  previousRevenue: string | null
  previousOrders: WireInt | null
  /** Percent to one place, or whole seconds; null when nothing finished in this bucket. */
  foundRate: string | null
  cantSupplyRate: string | null
  averageTimeToReady: WireInt | null
}

export interface InsightsTopProductDTO {
  productId: string
  name: string
  sku: string | null
  thumbnailUrl: string | null
  units: WireInt
  revenue: string
  /** 0..1 of the top row: a bar width. */
  share: number
  /** Its place in the comparison window; null when it sold nothing then. */
  previousRank: WireInt | null
}

/** Minutes from paid to ready: the ranges `quality.readySpread` counts, in order. */
export const READY_SPREAD_LABELS = ["Under 10", "10-20", "20-30", "30-40", "40-60", "Over 60"] as const

/** The Insights pages a briefing line can open. */
export type InsightsPage = "sales" | "products" | "service"

/**
 * How the period went, written by rules on the server so the same numbers always give the same words, and each line
 * can be traced to the page behind it. `mood` is null with nothing to compare against.
 */
export interface InsightsBriefingDTO {
  mood: "strong" | "steady" | "slower" | "quiet" | null
  /** What the period is compared with, ready for "on ...": "the week before". */
  comparedWith: string
  changes: Array<{ tone: "up" | "down" | "flat"; title: string; detail: string; page: InsightsPage }>
}

/** Orders by weekday and hour over recent weeks; `orders` is a total, so an average is `orders / weeks`. */
export interface InsightsRhythmDTO {
  weeks: WireInt
  /** ISO weekday (1 = Monday), local hour (0-23). Only cells with orders. */
  cells: Array<{ weekday: WireInt; hour: WireInt; orders: WireInt }>
}

export interface ShopInsightsDTO {
  range: InsightsRange
  timezone: string
  /** [from, to): the window the subtitle states. */
  window: { from: string; to: string }
  comparison: { basis: ComparisonBasis; from: string; to: string }
  /** When these figures were last recomputed; null means never, and the screen says so rather than showing zeros. */
  computedAt: string | null
  currency: string
  primary: {
    revenue: InsightsFigureDTO
    orders: InsightsFigureDTO & {
      /** "23 per day on average" for multi-day ranges; null for today. */
      perDay: string | null
      /** "6 in the last hour" for today; null for the longer ranges. */
      lastHour: WireInt | null
    }
    averageOrderValue: InsightsFigureDTO
    // Awaiting pick and Unfulfilled units come from `ShopTodayDTO.backlog`.
  }
  /** The drill-through strip; `lowStockSkus` and `readyForPickup` are read from `ShopTodayDTO`. */
  secondary: {
    refunds: InsightsFigureDTO & { orders: WireInt }
    cantSupply: InsightsFigureDTO & { units: WireInt }
    cancelled: InsightsFigureDTO
  }
  series: {
    grain: "hour" | "day" | "week"
    buckets: InsightsBucketDTO[]
    revenueTotal: InsightsFigureDTO
    ordersTotal: InsightsFigureDTO
  }
  topProducts: InsightsTopProductDTO[]
  briefing: InsightsBriefingDTO
  /** Null until two weeks have sold anything. */
  rhythm: InsightsRhythmDTO | null
  /** The products it could not supply in the window, most first. */
  cantSupplyProducts: Array<{ productId: string; name: string; units: WireInt }>
  /**
   * How well the shop fulfils (099), over the portions it finished in the window. Rates are percent
   * strings to one decimal place with an `abs` change in points; the average is whole seconds with a
   * `pct` change. Null when the window has nothing to measure.
   */
  quality: {
    foundRate: InsightsFigureDTO | null
    cantSupplyRate: InsightsFigureDTO | null
    averageTimeToReady: InsightsFigureDTO | null
    /** Orders by `READY_SPREAD_LABELS`; all zero when nothing finished. */
    readySpread: WireInt[]
  }
}

// Batch pick lists

export interface ShopPickListDTO {
  fulfillmentId: string
  orderNumber: string
  customerName: string
  paidAt: string
  /** Who takes this package away: the only delivery fact a shop is told. */
  deliveredBy: DeliveredBy
  /** Present only when a courier collects this package from the shop. */
  courierPickup?: CourierPickupDTO
  /** `variantLabel` is the size or flavour sold; null with no options. Ambient → Chilled → Frozen (099). */
  lines: Array<{ name: string; variantLabel?: string | null; variantCode?: string | null; sku: string | null; quantity: WireInt; storageClass: StorageClass }>
}

/** Every order waiting to be picked, as a printable document. No money: the sheet goes to the shelves. */
export interface ShopPickListsDTO {
  lists: ShopPickListDTO[]
  /** Portions beyond the 100 returned, so the print says what it left out. */
  more: WireInt
}
