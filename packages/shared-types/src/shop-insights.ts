/**
 * Shop console TODAY & INSIGHTS contracts (058).
 *
 * ⚠ TWO SCREENS, TWO DATA PROFILES, AND THEY MUST NOT SHARE A PAYLOAD. `ShopTodayDTO` is live
 * operational state — what needs doing right now, correct the moment an order is picked.
 * `ShopInsightsDTO` is prepared analytics — figures computed ahead of the request from rollups, and
 * never an aggregate over raw orders (FR-025/FR-026). Folding them into one response would force
 * one of the two to lie about its own freshness.
 *
 * ⚠ THE TWO FULFILMENT FIGURES ON INSIGHTS ARE NOT IN `ShopInsightsDTO`. "Awaiting pick" and
 * "Unfulfilled units" appear on both screens and must never disagree, so both screens render them
 * from `ShopTodayDTO.backlog` — ONE value, one cache entry (FR-006). Putting a second copy here is
 * exactly how 052's `summarizeFulfillment` came to exist, and why it was deleted.
 *
 * ⚠ WHAT NEVER CROSSES, as everywhere else in the shop family: no shop identifier in any request
 * (scope is the operator's record), no customer email or account history, no other shop's portion,
 * and no tax line (per-item GST is unmodelled — 052 R13).
 *
 * Money crosses as a 2-dp decimal STRING ("57.80"), never a float — the platform-wide rule.
 */

import type { WireInt } from "./cart"

// ── Today: the live operational snapshot ────────────────────────────────────────────────────────

/**
 * One thing waiting on a person, in the order the operator should look at them.
 *
 * ⚠ A DISCRIMINATED UNION, NOT A FLAT ROW WITH OPTIONAL FIELDS. Each kind resolves somewhere
 * different and carries different facts, and the union is what makes "a stock row with an order
 * number" unrepresentable rather than merely unlikely. The row's COPY is the client's — the server
 * sends kinds and numbers so the wording stays in one place (Part A, verbatim).
 */
export type ShopAttentionItemDTO =
  | {
      kind: "awaiting_pick"
      orders: WireInt
      units: WireInt
      /** The oldest waiting order's paid instant — the "oldest 3 h 12 m" in the detail line. */
      since: string
    }
  | {
      kind: "out_of_stock"
      productId: string
      name: string
      /**
       * Units sold in the last 7 days. ⚠ The design said "17 views today"; the platform records no
       * product views for a shop, and inventing one would put a number on screen that nothing can
       * be held to. Demand the platform actually knows is what this carries instead.
       */
      soldLast7Days: WireInt
      since: string
    }
  | {
      kind: "low_stock"
      productId: string
      name: string
      onHand: WireInt
      /** Null when the product has no recorded sales — cover cannot be derived from no demand. */
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
 * One of the five most recently paid orders.
 *
 * ⚠ EVERY ROW IS A STORED ORDER (FR-009). The imported design generated arrivals on a timer and had
 * to special-case rows that could not be opened; a shop only ever learns of an order after the
 * payment transaction has committed and fanned it out (019), so that state cannot exist here.
 */
export interface ShopLiveOrderDTO {
  /** The portion id — what the row opens. Never another order's (FR-009). */
  fulfillmentId: string
  orderNumber: string
  /** The delivery recipient's name, exactly as the Orders list shows it. */
  customerName: string
  paidAt: string
  /** Units on THIS shop's lines. */
  itemCount: WireInt
  deliveryMethod: "same_day" | "standard" | null
  /**
   * ⚠ The ORDER's total — the same figure the Orders list shows for this row (057 A3), which is why
   * it is not the same basis as Insights' Revenue (this shop's goods only, FR-032). The Insights
   * subtitles say "Goods · AUD" so the two are never read as the same number.
   */
  total: string
  currency: string
}

export interface ShopBacklogDTO {
  /**
   * ⚠ THE value behind FR-006. The Needs attention row, its unit figure, the open-items badge, the
   * glance cell, the nav badge and both Insights fulfilment cells all render from this one field of
   * one cached query — not from six queries that agree today.
   */
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
  /**
   * The SERVER's clock. The subtitle's weekday and date are formatted from this in the shop's
   * timezone, so a browser clock in another zone (or simply wrong) cannot shift the day.
   */
  now: string
  /** IANA zone name — the shop's day, hours and weeks (FR-023). */
  timezone: string
  backlog: ShopBacklogDTO
  /** At most 8, ordered: awaiting pick → out of stock → refunds → low stock, oldest first. */
  attention: ShopAttentionItemDTO[]
  /** Open items beyond the 8 shown — the queue link's remainder, never a hidden count. */
  attentionMore: WireInt
  /** The oldest open item's instant: "Oldest item waiting {age}". Null when nothing waits. */
  oldestWaitingAt: string | null
  live: ShopLiveOrderDTO[]
}

// ── Insights: prepared figures ──────────────────────────────────────────────────────────────────

export const INSIGHTS_RANGES = ["today", "7d", "30d"] as const
export type InsightsRange = (typeof INSIGHTS_RANGES)[number]

/**
 * What a figure is compared with. ⚠ "today" compares with the same weekday last week UP TO THE SAME
 * LOCAL TIME — comparing a morning against a whole day would read as a collapse every morning.
 */
export const COMPARISON_BASES = [
  "same_weekday_last_week",
  "previous_7_days",
  "previous_30_days",
] as const
export type ComparisonBasis = (typeof COMPARISON_BASES)[number]

/**
 * A figure and what it is measured against.
 *
 * ⚠ THE SERVER COMPUTES THE CHANGE (FR-024). The client formats "+9% vs previous week" from these
 * fields and never subtracts: two surfaces doing their own arithmetic on the same pair is how two
 * screens come to disagree about one number.
 *
 * `kind: "none"` is a real answer, not a missing one — there is nothing to compare against (a new
 * shop, or a previous window with no sales), and the UI says so rather than printing "+100%".
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
  /** Bucket start instant — the UTC moment the local hour/day/week began. */
  start: string
  /** The mono axis label: "14", "Mon 8", "W35". */
  label: string
  /** A week (or day) cut short by the window's edge — so a shorter bar is explainable. */
  partial: boolean
  revenue: string
  orders: WireInt
}

export interface InsightsTopProductDTO {
  productId: string
  name: string
  sku: string | null
  thumbnailUrl: string | null
  units: WireInt
  revenue: string
  /** 0..1 of the top row — a bar width, not a figure to read. */
  share: number
}

export interface ShopInsightsDTO {
  range: InsightsRange
  timezone: string
  /** [from, to) — the exact window the subtitle states. */
  window: { from: string; to: string }
  comparison: { basis: ComparisonBasis; from: string; to: string }
  /**
   * When these figures were last recomputed — surfaced as "updated a moment ago". ⚠ Null means the
   * rollups have never run for this shop, and the screen says THAT rather than showing zeros as if
   * they were measured.
   */
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
    // Awaiting pick + Unfulfilled units are NOT here — see this file's header (FR-006/FR-017).
  }
  /**
   * The drill-through strip. ⚠ The design's `Conversion rate`, `New customers` and `Returns open`
   * are NOT built (FR-034): a shop has no storefront of its own to convert, customer relationship
   * data is withheld from shops (023 FR-018), and the platform has no returns model. Their three
   * slots carry figures the platform can actually stand behind. `lowStockSkus` and `readyForPickup`
   * are live values the client reads from `ShopTodayDTO` — they are not in this payload.
   */
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
}

// ── Team activity ───────────────────────────────────────────────────────────────────────────────

/**
 * Who did it.
 *
 * ⚠ A BACK-OFFICE STAFF NAME NEVER CROSSES — platform actions are attributed to "Effy", the same
 * boundary 023 FR-018 draws for customer data, applied to Effy's own people. And a departed
 * operator is `former_staff`, never blank: 020's audit comment is explicit that a NULL actor means
 * "the person is gone", never "nobody did it".
 */
export type TeamActivityActorDTO =
  | { kind: "staff"; name: string }
  | { kind: "former_staff" }
  | { kind: "effy" }

export type TeamActivityActionDTO =
  | { kind: "state_changed"; orderNumber: string; to: string }
  | {
      kind: "item_gathered" | "item_unavailable" | "item_restored"
      orderNumber: string
      productName: string
      quantity: WireInt
    }
  | { kind: "note_added" | "tags_changed"; orderNumber: string }
  | { kind: "stock_changed"; productName: string; reason: string; delta: WireInt }
  | { kind: "refund_issued"; orderNumber: string; amount: string }

export interface TeamActivityEntryDTO {
  /** Stable per source row — a React key, not an identifier anything else may resolve. */
  id: string
  at: string
  actor: TeamActivityActorDTO
  action: TeamActivityActionDTO
  /** Drives a dot marker only. ⚠ Never a text colour (Principle V: success is a non-text indicator). */
  tone: "done" | "problem" | "neutral"
}

export interface ShopTeamActivityDTO {
  entries: TeamActivityEntryDTO[]
}

// ── Batch pick lists ────────────────────────────────────────────────────────────────────────────

export interface ShopPickListDTO {
  fulfillmentId: string
  orderNumber: string
  customerName: string
  paidAt: string
  deliveryMethod: "same_day" | "standard" | null
  lines: Array<{ name: string; sku: string | null; quantity: WireInt }>
}

/**
 * Every order waiting to be picked, as a printable document.
 *
 * ⚠ NO MONEY, deliberately — 020's rule for the pick document. The console shows an order's money
 * on screen (057 A3); a sheet of paper that goes to the shelves does not need it and should not
 * carry it.
 */
export interface ShopPickListsDTO {
  lists: ShopPickListDTO[]
  /** Portions beyond the 100 returned — the print says what it could not include. */
  more: WireInt
}
