/**
 * Shop console Today and Insights. Two payloads on purpose: `ShopTodayDTO` is live state, `ShopInsightsDTO`
 * prepared figures from rollups. "Awaiting pick" and "Unfulfilled units" appear on both screens from
 * `ShopTodayDTO.backlog` only. No shop id in any request, no customer email or history, no other shop's
 * portion, no tax line. Money is a 2-dp decimal string.
 */

import type { WireInt } from "./cart"
import type { DeliveredBy } from "./delivery-type"
import type { PackageStatus } from "./package-status"
import type { CourierPickupDTO } from "./shop-order"
import type { CollectionDriver, ShopNextCollectionDTO, StorageClass } from "./shop-order-console"

// Today: the live snapshot

export const TODAY_EVENT_LIMIT = 12

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

/**
 * One Effy collection run today, earliest first, with this shop's orders on it by how far each is. A run already
 * collected counts what the driver took (`collected`) and what was not ready when it came (`missed`, which then travel
 * on a later run and count there too).
 */
export interface ShopTodayRunDTO {
  runAt: string
  driver: CollectionDriver
  /** When the driver collected from this shop; null until then. */
  collectedAt: string | null
  /** The first order on this run's paid instant: where its bar starts. Null with no orders. */
  firstPaidAt: string | null
  collected: WireInt
  ready: WireInt
  picking: WireInt
  /** Paid, and nobody has started picking. */
  waiting: WireInt
  missed: WireInt
}

/** A courier's pickup from this shop today: its time, and the parcels on it. */
export interface ShopTodayPickupDTO {
  /** The pickup window's start, as an instant on the shop's clock; null when the courier gave no time. */
  from: string | null
  to: string | null
  courierName: string | null
  parcels: WireInt
  handedOver: WireInt
}

/** An order someone is picking now. `picker` is a colleague's name; null when nobody recorded starting it. */
export interface ShopTodayPickingDTO {
  fulfillmentId: string
  orderNumber: string
  units: WireInt
  startedAt: string
  picker: string | null
  /** The Effy run it is due on; null for a courier order. */
  runAt: string | null
  deliveredBy: DeliveredBy
}

/** An order still at the shop that was not ready when its Effy driver came. */
export interface ShopTodayLateDTO {
  fulfillmentId: string
  orderNumber: string
  units: WireInt
  missedRunAt: string
  /** The run it goes on now; null when no run is left today. */
  nextRunAt: string | null
  stage: "waiting" | "picking" | "ready"
  picker: string | null
}

export interface ShopOutOfStockDTO {
  productId: string
  /** The size that is out; `name` already says which ("Rice - 1 kg"). */
  variantId: string
  name: string
  /** Units sold in the last 7 days: demand the platform knows (it records no product views). */
  soldLast7Days: WireInt
  since: string
}

export interface ShopRefundWaitingDTO {
  fulfillmentId: string
  orderNumber: string
  amount: string
  since: string
}

/** This shop's goods sold today, most first, with what it has left. `stockLeft` is null when stock is not counted. */
export interface ShopTodaySellingDTO {
  productId: string
  name: string
  units: WireInt
  stockLeft: WireInt | null
}

export interface ShopTodayDTO {
  /** The server's clock; the date is formatted in the shop's timezone, so a wrong browser clock cannot shift the day. */
  now: string
  /** IANA zone name: the shop's day, hours and weeks. */
  timezone: string
  backlog: ShopBacklogDTO
  /** Every Effy collection run today, earliest first. Empty when no collection runs are set up. */
  runs: ShopTodayRunDTO[]
  /** Courier pickups from this shop today, earliest first. */
  courierPickups: ShopTodayPickupDTO[]
  /** Today's orders by where their package is, in the nine status words, by who takes them. */
  packages: Record<DeliveredBy, Record<PackageStatus, WireInt>>
  /** Being picked now, longest first. */
  picking: ShopTodayPickingDTO[]
  /** Not ready when their driver came, oldest first. */
  late: ShopTodayLateDTO[]
  /** Out of stock, most sold first: at most 20, with `outOfStockMore` beyond. */
  outOfStock: ShopOutOfStockDTO[]
  outOfStockMore: WireInt
  /** Refunds Effy proposed for items this shop could not supply; empty unless the reader may refund. */
  refunds: ShopRefundWaitingDTO[]
  /** Most sold today, at most 5. */
  selling: ShopTodaySellingDTO[]
  /** What the catalogue needs: products missing a required detail, and changes with Effy or sent back. */
  catalog: { missingDetails: WireInt; inReview: WireInt; sentBack: WireInt }
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
  /** This shop's units on those orders: items per order is `units / orders`. */
  units: WireInt
  /** The same point of the comparison window; null when the comparison is shorter (a day still running). */
  previousRevenue: string | null
  previousOrders: WireInt | null
  previousUnits: WireInt | null
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
  /** Percent of the period's goods sold, to one place. */
  shareOfSales: string
  /** Its place in the comparison window; null when it sold nothing then. */
  previousRank: WireInt | null
  /** Units on hand now across its counted sizes; null when none of its sizes counts stock. */
  stockLeft: WireInt | null
}

/** Orders by how many of the shop's items they held: the ranges `orderSizes` counts, in order. */
export const ORDER_SIZE_LABELS = ["1-2", "3-5", "6-10", "11-20", "21+"] as const

/** Stock as it is now and as it moved in the window: read live, not from the rollups. */
export interface InsightsStockDTO {
  /** A size with none left that sold in the window, most sold first. */
  outOfStock: Array<{ productId: string; variantId: string; name: string; sold: WireInt; since: string }>
  /** Counted products that run out within three days at the last four weeks' pace, soonest first. */
  runningOut: Array<{ productId: string; name: string; left: WireInt; perDay: string; daysLeft: string }>
  /**
   * Sizes that reached none in the window: how often, for how long, and the sales that probably cost (hours out times
   * what the product sells in an hour over four weeks, at its price). `stillOut` when it has none now.
   */
  soldOut: Array<{
    productId: string
    variantId: string
    name: string
    times: WireInt
    hours: string
    stillOut: boolean
    missedRevenue: string
  }>
  /** On sale, with stock, and not sold in 30 days; null until the shop has sold for 30 days. */
  notSelling: Array<{ productId: string; name: string; left: WireInt; value: string }> | null
  /** Stock recorded as expired or damaged, and count corrections, in the window; values at the shop's prices. */
  writtenOff: {
    expired: { units: WireInt; value: string }
    damaged: { units: WireInt; value: string }
    corrections: { units: WireInt }
  }
}

/** Minutes from paid to ready: the ranges `quality.readySpread` counts, in order. */
export const READY_SPREAD_LABELS = ["Under 10", "10-20", "20-30", "30-40", "40-60", "Over 60"] as const

/** The Insights pages a briefing line can open. */
export type InsightsPage = "sales" | "products" | "stock" | "service"

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
    /** This shop's units per order. */
    itemsPerOrder: InsightsFigureDTO
    // Awaiting pick and Unfulfilled units come from `ShopTodayDTO.backlog`.
  }
  /**
   * Today only: where the day ends if the rest goes as this weekday usually does (its share of a usual day sold by now,
   * from `rhythm`). Null for the longer ranges, before two weeks of rhythm, or before anything sold.
   */
  pace: { orders: WireInt; revenue: string } | null
  /** Sales on each weekday, Monday first, averaged over the last four weeks. Null before two weeks of orders. */
  weekdays: Array<{ weekday: WireInt; revenue: string }> | null
  /** Average seconds from paid to ready by the local hour the order became ready, over the window: hours with orders. */
  readyByHour: Array<{ hour: WireInt; seconds: WireInt; orders: WireInt }>
  /** Sales by the top of each product's category tree, most first, with the comparison's. */
  aisles: Array<{ categoryId: string; name: string; revenue: string; previous: string | null }>
  /** Orders by `ORDER_SIZE_LABELS`. */
  orderSizes: WireInt[]
  /** Who takes the period's orders, and how many came from people who had bought this shop's goods before. */
  customers: { effyDriver: WireInt; courier: WireInt; returning: WireInt }
  /** How many products sold, and how few of them make 80% of sales. */
  concentration: { products: WireInt; top80: WireInt }
  /** This shop's products that most often share an order, most first. */
  together: Array<{ a: { productId: string; name: string }; b: { productId: string; name: string }; orders: WireInt }>
  /** Each Effy collection run time in the window ("14:30", local): the orders its driver came for, and those ready. */
  runs: Array<{ time: string; due: WireInt; ready: WireInt }>
  /** Who finished the window's orders. Managers only: null for staff. */
  pickers: Array<{ staffId: string; name: string; orders: WireInt; averageTimeToReady: WireInt | null; cantSupplyUnits: WireInt }> | null
  /** Null when stock could not be read: the rest of the page still shows. */
  stock: InsightsStockDTO | null
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
    /** Orders ready when their Effy driver came, of those it came for, in percent. Null with no run in the window. */
    readyBeforeDriver: InsightsFigureDTO | null
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
