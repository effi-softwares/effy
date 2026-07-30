/**
 * Promotional codes & order rules management contracts — 027-customer-cart-sync.
 *
 * The back-office surface for the platform's first commercial lever: promotional codes, and the one row
 * that holds the order rules (minimum spend + the two cart ceilings). Consumed by `apps/back-office`
 * against `apis/edge-api/admin` (cold path); the CUSTOMER side of a code — applying it, and the
 * discount — lives in `cart.ts` on the hot path, because that is a latency-sensitive customer
 * transaction (Principle III, 011 FR-028).
 *
 * These are the OPERATOR's view. Full identity and attribution are appropriate here; none of it reaches
 * a customer surface. Mirrors the 021 delivery-management contract shape and reuses `PagedDTO<T>` and
 * `AuditEntryDTO` from `shop.ts`.
 *
 * API: specs/027-customer-cart-sync/contracts/promotions-admin-api.contract.md
 * Data: specs/027-customer-cart-sync/data-model.md §6–§8
 */
import type { PagedDTO } from "./shop";

/** What a code takes off: a percentage of the payable items, or a fixed amount. */
export type PromoKind = "percentage" | "fixed";
export const PROMO_KINDS: readonly PromoKind[] = ["percentage", "fixed"];

/**
 * A code's lifecycle. There is no delete for a code that has been used (FR-070) — disabling is the
 * removal path, so every paid order keeps a code that still explains it.
 */
export type PromoStatus = "active" | "disabled";
export const PROMO_STATUSES: readonly PromoStatus[] = ["active", "disabled"];

/** A promotional code, as an operator sees it. */
export interface PromoCodeDTO {
  id: string;
  code: string;
  kind: PromoKind;
  /** Set when kind is "percentage"; 1–100. Null otherwise. */
  percentOff: number | null;
  /** Set when kind is "fixed"; a decimal string. Null otherwise. */
  amountOff: string | null;
  currency: string;
  minimumSubtotalAmount: string;
  /** ISO 8601. Null means no lower bound — an open-ended promotion is legitimate. */
  startsAt: string | null;
  /** ISO 8601. Null means no upper bound. */
  endsAt: string | null;
  /** Null means uncapped. */
  maxRedemptions: number | null;
  /** Null means uncapped per shopper. */
  maxPerCustomer: number | null;
  status: PromoStatus;
  /**
   * COUNTED from actual redemptions, never a stored counter — a counter and a redemption row can
   * disagree, and then nobody knows which is true. Also the reason a used code becomes immutable.
   */
  redemptionCount: number;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PromoCodeListDTO = PagedDTO<PromoCodeDTO>;

/** POST /admin/v1/promotions. */
export interface CreatePromoCodeRequest {
  code: string;
  kind: PromoKind;
  percentOff?: number;
  amountOff?: string;
  minimumSubtotalAmount?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  maxRedemptions?: number | null;
  maxPerCustomer?: number | null;
}

/**
 * PATCH /admin/v1/promotions/{id}.
 *
 * ⚠ Once a code has been redeemed, ONLY the window, the caps and the status may change. Altering
 * `code`, `kind`, `percentOff`, `amountOff` or `minimumSubtotalAmount` on a used code is refused
 * (`promo_immutable_once_used`) — not out of squeamishness about editing, but because a paid order's
 * stored discount was computed from the definition as it stood, and the receipt has to stay
 * explainable. Changing a window or a cap changes only what happens next; changing the value rewrites
 * the meaning of history.
 */
export interface UpdatePromoCodeRequest {
  startsAt?: string | null;
  endsAt?: string | null;
  maxRedemptions?: number | null;
  maxPerCustomer?: number | null;
  /** Accepted only while `redemptionCount === 0`. */
  code?: string;
  kind?: PromoKind;
  percentOff?: number;
  amountOff?: string;
  minimumSubtotalAmount?: string;
}

/** POST /admin/v1/promotions/{id}/status. */
export interface SetPromoStatusRequest {
  status: PromoStatus;
}

/**
 * The single order-rules row (GET/PUT /admin/v1/order-policy). Read by the hot path on every cart read
 * so that the rule the platform enforces and the number the shopper is shown cannot drift apart.
 */
export interface OrderPolicyDTO {
  /** "0.00" means no minimum is in force, and the cart shows nothing at all (FR-057). */
  minimumSubtotalAmount: string;
  currency: string;
  maxLineQuantity: number;
  maxDistinctItems: number;
  updatedBy: string | null;
  updatedAt: string;
}

/** PUT /admin/v1/order-policy. */
export interface UpdateOrderPolicyRequest {
  minimumSubtotalAmount: string;
  maxLineQuantity: number;
  maxDistinctItems: number;
}
