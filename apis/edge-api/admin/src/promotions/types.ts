// Domain types for promotions & order rules management (027 US10). Money is a decimal string here, as
// everywhere on the wire; the hot path converts to integer cents when it computes a discount.
//
// ⚠ These are the OPERATOR's view. The customer half of a promotional code — applying it, and the
// discount — lives on the hot path, because that is latency-sensitive customer traffic (Principle III).

export type PromoKind = "percentage" | "fixed";
export const PROMO_KINDS: readonly PromoKind[] = ["percentage", "fixed"];

export type PromoStatus = "active" | "disabled";
export const PROMO_STATUSES: readonly PromoStatus[] = ["active", "disabled"];

export interface PromoCode {
  id: string;
  code: string;
  kind: PromoKind;
  percentOff: number | null;
  amountOff: string | null;
  currency: string;
  minimumSubtotalAmount: string;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxPerCustomer: number | null;
  status: PromoStatus;
  /** COUNTED from promo_redemption, never a stored counter — a counter and the rows can disagree. */
  redemptionCount: number;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;

  // ── The advertising facet (028) ─────────────────────────────────────────────────────────────
  //
  // ⚠ PRESENTATION ONLY. None of this participates in what a promotion is worth, so none of it is
  // subject to the redeemed-code immutability guard (FR-068). A headline typo must be correctable on
  // a promotion people are already using; a discount percentage must not.
  isAdvertised: boolean;
  bannerTitle: string | null;
  bannerSubtitle: string | null;
  bannerImageKey: string | null;
  bannerPosition: number;
}

export interface OrderPolicy {
  minimumSubtotalAmount: string;
  currency: string;
  maxLineQuantity: number;
  maxDistinctItems: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditEntry {
  id: string;
  actorSub: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface FieldIssue {
  field: string;
  message: string;
}

/**
 * A refusal the operator must be able to act on. `code` is the wire reason (contract §5) — each is a
 * different fix: a duplicate needs a new code, an inverted window needs different dates, and an attempt
 * to rewrite a USED code needs the operator to understand why that is refused at all.
 */
export class PromoError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: FieldIssue[] = [],
  ) {
    super(message);
    this.name = "PromoError";
  }
}

export function isPromoError(err: unknown): err is PromoError {
  return err instanceof PromoError || (err as PromoError)?.name === "PromoError";
}
