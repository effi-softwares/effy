// Domain types for TODAY — the shop console's live operational snapshot (058, US1/US2).
//
// ⚠ A SIBLING OF `orders/` AND `fulfillments/`, reading the same tables and answering a different
// question. The order console answers "show me this order"; Today answers "what needs me, right
// now". It owns no state of its own: every figure here is COUNTED from live rows on each read
// (027's counted-not-stored rule), which is what makes it correct the moment an order is picked
// rather than correct as of the last time something remembered to update a counter.
//
// Wire DTOs live in @effy/shared-types (`shop-insights`); nothing wire-shaped escapes the handler
// (Principle VI). No request type carries a shop id — scope comes from the operator's record.

/** The pick backlog, and the two other counts the screens quote beside it. */
export interface Backlog {
  awaitingPick: {
    orders: number;
    units: number;
    oldestPaidAt: Date | null;
  };
  readyForPickup: number;
  lowStock: { skus: number; outOfStock: number };
}

/** A product that needs restocking, with the demand behind it. */
export interface StockAttention {
  productId: string;
  name: string;
  onHand: number;
  /** Units sold in the last 7 days — the real demand fact (the design's "17 views" does not exist). */
  soldLast7Days: number;
  /** Null when nothing sold: cover cannot be derived from no demand. */
  daysOfCover: number | null;
  severity: "out" | "low";
  /** When this product's stock last moved — how long the shelf has looked like this. */
  since: Date;
}

/** One of the five most recently paid orders. Always a stored portion (FR-009). */
export interface LiveOrder {
  fulfillmentId: string;
  orderNumber: string;
  customerName: string;
  paidAt: Date;
  itemCount: number;
  deliveryMethod: "same_day" | "standard" | null;
  total: string;
  currency: string;
}

/** A refund the platform proposes for this shop's own short lines (055, derived). */
export interface ProposedRefund {
  fulfillmentId: string;
  orderNumber: string;
  amount: string;
  since: Date;
}

export interface TodaySnapshot {
  now: Date;
  timezone: string;
  backlog: Backlog;
  stock: StockAttention[];
  proposals: ProposedRefund[];
  live: LiveOrder[];
}

/**
 * One thing waiting on a person.
 *
 * ⚠ A DISCRIMINATED UNION, not a flat row with optional fields: each kind resolves somewhere
 * different and carries different facts, and the union makes "a stock row with an order number"
 * unrepresentable rather than merely unlikely.
 */
export type AttentionItem =
  | { kind: "awaiting_pick"; orders: number; units: number; since: Date }
  | { kind: "out_of_stock"; productId: string; name: string; soldLast7Days: number; since: Date }
  | {
      kind: "low_stock";
      productId: string;
      name: string;
      onHand: number;
      daysOfCover: number | null;
      since: Date;
    }
  | { kind: "refund_proposed"; fulfillmentId: string; orderNumber: string; amount: string; since: Date };

/** What the Needs attention card renders: the rows it shows, and the truth about the rest. */
export interface AttentionView {
  items: AttentionItem[];
  more: number;
  /** The oldest open item's instant — the card's "Oldest item waiting {age}". */
  oldestWaitingAt: Date | null;
}
