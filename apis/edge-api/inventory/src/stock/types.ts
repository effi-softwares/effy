import type { StockMovementReason } from "@effy/shared-types";

/** Resolved by the gate, never read from a request body. */
export interface Actor {
  sub: string;
  /** The caller's active shop, or the path's for back-office; never a shop route's input. */
  shopId: string;
  kind: "shop" | "back_office";
}

/** Covers "no such product" and "another shop's" with byte-identical refusals. */
export type StockErrorKind = "not_found" | "validation" | "conflict";

export class StockError extends Error {
  constructor(
    readonly kind: StockErrorKind,
    message: string,
    /** Per-field detail, so the console can point at the input. */
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "StockError";
  }
}

export const notFound = (): StockError =>
  new StockError("not_found", "no such variant");

export interface StockRow {
  productId: string;
  variantId: string;
  shopId: string;
  tracked: boolean;
  onHand: number | null;
  threshold: number | null;
  shopDefaultThreshold: number | null;
}

export interface MovementRow {
  id: string;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: StockMovementReason;
  actorKind: "shop" | "back_office" | "system";
  actorLabel: string | null;
  orderNumber: string | null;
  note: string | null;
  createdAt: string;
}
