/**
 * Promotional codes (027 US5).
 *
 * ⚠ ONE evaluation function, used by both the cart read and the charge. A promotion the cart says
 * applies and checkout then refuses is exactly the wrong-charge the cart feature exists to prevent,
 * so there is deliberately a single home for the rule. It is pure: every input is passed in,
 * including the clock.
 *
 * ⚠ The discount is NEVER stored on the cart — only which code is applied. The amount is derived on
 * every read, so there is no stale figure to drift.
 */
import { formatCents } from "@effy/edge-shared";

/**
 * Why a code was refused. Each is a stable machine code the client keys off — the shopper is told
 * WHICH reason, never a generic "invalid".
 */
export type PromoRefusal =
  | "promo_unknown"
  | "promo_not_started"
  | "promo_expired"
  | "promo_disabled"
  | "promo_exhausted"
  | "promo_already_used"
  | "promo_below_minimum"
  | "promo_not_applicable";

export class PromoRefusedError extends Error {
  constructor(readonly reason: PromoRefusal, readonly code?: PromoCode) {
    super(reason);
    this.name = "PromoRefusedError";
  }
}

export const PROMO_PERCENTAGE = "percentage";
export const PROMO_FIXED = "fixed";

/** A promotion's definition, with money as integer cents. */
export interface PromoCode {
  id: string;
  code: string;
  kind: string;
  /** Meaningful when kind is percentage. */
  percentOff: number;
  /** Meaningful when kind is fixed. */
  amountOffCents: number;
  /** 0 = no minimum. */
  minimumSubtotalCents: number;
  startsAt: Date | null;
  endsAt: Date | null;
  /** null = unlimited. */
  maxRedemptions: number | null;
  maxPerCustomer: number | null;
  status: string;
}

/**
 * How often a code has been redeemed — counted from promo_redemption, never from a stored counter.
 * The rows are the truth; a counter and the rows can disagree.
 */
export interface PromoUsage {
  total: number;
  byThisShopper: number;
}

/** Case-insensitive, so "save10" and "SAVE10" are one code (the DB enforces the same). */
export function normalisePromoCode(s: string): string {
  return s.trim().toUpperCase();
}

/**
 * Decide whether a code applies and what it is worth against `payableCents` — the cart's PAYABLE
 * subtotal, the same base the minimum order value is judged on. Returns the discount in cents, or
 * the refusal.
 *
 * The order of checks is deliberate: lifecycle and validity first (the code itself is unusable),
 * then caps (it is used up), then the cart (the shopper can do something about it).
 */
export function evaluatePromo(
  code: PromoCode,
  usage: PromoUsage,
  payableCents: number,
  now: Date,
): { ok: true; discountCents: number } | { ok: false; reason: PromoRefusal } {
  const refuse = (reason: PromoRefusal) => ({ ok: false as const, reason });

  if (code.status !== "active") return refuse("promo_disabled"); // availability-exempt: public.promo_code
  if (code.startsAt && now.getTime() < code.startsAt.getTime()) return refuse("promo_not_started");
  if (code.endsAt && now.getTime() >= code.endsAt.getTime()) return refuse("promo_expired");
  if (code.maxRedemptions !== null && usage.total >= code.maxRedemptions) return refuse("promo_exhausted");
  if (code.maxPerCustomer !== null && usage.byThisShopper >= code.maxPerCustomer) return refuse("promo_already_used");
  // Nothing to discount. Distinct from "below minimum": an empty cart is not a spending problem.
  if (payableCents <= 0) return refuse("promo_not_applicable");
  if (payableCents < code.minimumSubtotalCents) return refuse("promo_below_minimum");

  return { ok: true, discountCents: discountFor(code, payableCents) };
}

/**
 * The discount, capped so it can never exceed what it applies to: a discount larger than the
 * subtotal would make the total negative.
 */
export function discountFor(code: PromoCode, payableCents: number): number {
  let cents = 0;
  if (code.kind === PROMO_PERCENTAGE) {
    // Integer arithmetic throughout; rounding DOWN, so a rounding error can only ever favour the
    // platform by a cent rather than quietly giving money away.
    cents = Math.floor((payableCents * code.percentOff) / 100);
  } else if (code.kind === PROMO_FIXED) {
    cents = code.amountOffCents;
  }
  return Math.max(0, Math.min(cents, payableCents));
}

/** The short human description of what a code does — "10% off", "5.00 off". */
export function promoLabel(code: PromoCode): string {
  if (code.kind === PROMO_PERCENTAGE) return `${code.percentOff}% off`;
  if (code.kind === PROMO_FIXED) return `${formatCents(code.amountOffCents)} off`;
  return "Discount";
}

/**
 * What a shopper is told when a code they APPLY is refused. Specific on purpose: "expired",
 * "already used" and "below the minimum" each call for a different response from them.
 */
export function refusalDetail(reason: PromoRefusal, code?: PromoCode): string {
  switch (reason) {
    case "promo_unknown":
      return "That code isn't recognised.";
    case "promo_not_started":
      return "That code is not active yet.";
    case "promo_expired":
      return "That code has expired.";
    case "promo_disabled":
      return "That code is no longer available.";
    case "promo_exhausted":
      return "That code has been fully redeemed.";
    case "promo_already_used":
      return "You have already used that code.";
    case "promo_below_minimum":
      return code
        ? `Spend ${formatCents(code.minimumSubtotalCents)} or more to use that code.`
        : "Your cart is below the minimum for that code.";
    case "promo_not_applicable":
      return "Add something to your cart before applying a code.";
  }
}

/** The shopper-facing reason a code ALREADY on the cart stopped applying. */
export function lapsedDetail(reason: PromoRefusal, code: PromoCode): string {
  switch (reason) {
    case "promo_below_minimum":
      return `Your cart is now below the ${formatCents(code.minimumSubtotalCents)} minimum for this code.`;
    case "promo_expired":
      return "That code has expired.";
    case "promo_not_started":
      return "That code is not active yet.";
    case "promo_disabled":
      return "That code is no longer available.";
    default:
      return "That code no longer applies to your cart.";
  }
}
