import type { CourierPickupDTO, ShopNextCollectionDTO, ShopOrderCollectionDTO } from "@effy/shared-types";
// Today answers "what needs me, now", counted from live rows on each read; it owns no state. No request
// type carries a shop id.

export interface Backlog {
  awaitingPick: {
    orders: number;
    units: number;
    oldestPaidAt: Date | null;
  };
  readyForPickup: number;
  lowStock: { skus: number; outOfStock: number };
}

export interface StockAttention {
  productId: string;
  /** One size; its name says which. */
  variantId: string;
  name: string;
  onHand: number;
  /** Units sold in the last 7 days. */
  soldLast7Days: number;
  /** Null when nothing sold. */
  daysOfCover: number | null;
  severity: "out" | "low";
  /** How long the shelf has looked like this. */
  since: Date;
}

export interface LiveOrder {
  fulfillmentId: string;
  orderNumber: string;
  customerName: string;
  paidAt: Date;
  itemCount: number;
  /** The only thing a shop is told about delivery. */
  deliveredBy: "effy_driver" | "courier";
  /** Present only when a courier collects this package from the shop. */
  courierPickup?: CourierPickupDTO;
  total: string;
  currency: string;
  /** The run expected to collect it, when an Effy driver will (099). */
  collection?: ShopOrderCollectionDTO;
}

/** Derived for this shop's own short lines. */
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
  nextCollection: ShopNextCollectionDTO | null;
}

/** A discriminated union: each kind resolves somewhere different with different facts. */
export type AttentionItem =
  | { kind: "awaiting_pick"; orders: number; units: number; since: Date }
  | { kind: "out_of_stock"; productId: string; variantId: string; name: string; soldLast7Days: number; since: Date }
  | {
      kind: "low_stock";
      productId: string;
      variantId: string;
      name: string;
      onHand: number;
      daysOfCover: number | null;
      since: Date;
    }
  | { kind: "refund_proposed"; fulfillmentId: string; orderNumber: string; amount: string; since: Date };

export interface AttentionView {
  items: AttentionItem[];
  more: number;
  /** "Oldest item waiting {age}". */
  oldestWaitingAt: Date | null;
}
