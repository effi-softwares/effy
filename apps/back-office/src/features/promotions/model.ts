import type {
  AuditEntryDTO,
  CreatePromoCodeRequest,
  OrderPolicyDTO,
  PagedDTO,
  PromoCodeDTO,
  PromoStatus,
  SetPromoStatusRequest,
  UpdateOrderPolicyRequest,
  UpdatePromoCodeRequest,
} from "@effy/shared-types";

/**
 * Domain shapes for back-office promotional-code & order-rules management (027 US10).
 *
 * The wire DTOs (specs/027 contracts, already in @effy/shared-types) are the domain shapes here — they
 * carry no wire-only encoding to strip. Every read/write still routes through the repo layer
 * (Principle VI), so if a DTO and its domain model ever diverge, only the repo changes. Mirrors 021.
 */
export type PromoCode = PromoCodeDTO;
export type OrderPolicy = OrderPolicyDTO;
export type AuditEntry = AuditEntryDTO;
export type Paged<T> = PagedDTO<T>;

export type {
  CreatePromoCodeRequest,
  SetPromoStatusRequest,
  UpdateOrderPolicyRequest,
  UpdatePromoCodeRequest,
};

/** Query params for the code register (server-side pagination + filter + search). */
export interface PromoListParams {
  page: number;
  pageSize: number;
  status?: PromoStatus;
  q?: string;
}

/**
 * Whether this code's VALUE can still be edited (FR-068).
 *
 * ⚠ The UI asks this to decide which fields to disable; it is NOT the enforcement. The platform
 * re-counts redemptions inside the transaction that writes, because a code can be redeemed between the
 * screen rendering and the operator pressing Save.
 */
export function isValueEditable(promo: PromoCode): boolean {
  return promo.redemptionCount === 0;
}

/** How a code reads in a list: "20% off" / "$10.00 off". Display only. */
export function promoValueLabel(promo: PromoCode): string {
  if (promo.kind === "percentage") return `${promo.percentOff ?? 0}% off`;
  return `${promo.currency === "AUD" ? "$" : ""}${promo.amountOff ?? "0.00"} off`;
}

/** "3 of 500" / "3 used" when the code is uncapped. */
export function redemptionLabel(promo: PromoCode): string {
  return promo.maxRedemptions == null
    ? `${promo.redemptionCount} used`
    : `${promo.redemptionCount} of ${promo.maxRedemptions}`;
}
