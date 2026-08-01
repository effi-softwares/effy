/**
 * Delivery pricing & same-day coverage contracts — 032-delivery-pricing.
 *
 * Two concerns that this feature deliberately keeps apart (research R3):
 *
 *   - PRICE is the platform's decision alone. Derived from banded distance + banded weight, rounded
 *     UP, then capped. No shop can see or set it — there is no pricing route on the shop service at
 *     all, which is how FR-008 is enforced (topology, not a check that could be forgotten).
 *   - SAME-DAY ELIGIBILITY is per SHOP. A shop declares which areas it will serve; an admin approves.
 *     ⚠ 031 collapsed the origin dimension, arguing the shopper cannot perceive which shop serves
 *     them. That is true for PRICE and false for ELIGIBILITY: whether same-day is physically possible
 *     depends entirely on which shop holds the goods.
 *
 * Consumed by `apps/back-office` + `apis/edge-api/admin` (pricing, approvals) and `apps/shop-web` +
 * `apis/edge-api/shop` (declarations). ⚠ NONE of this reaches a customer surface: a shopper sees a
 * rounded fee and nothing else — no distance, at any granularity (FR-034).
 *
 * ⚠ NO KOTLIN IS GENERATED FROM THIS MODULE, AND THAT IS CORRECT — DO NOT "FIX" IT.
 * The schema generator walks the `CustomerCommerceContract` aggregator; a type outside it generates
 * nothing. 030 nearly shipped a customer-facing DTO that way by accident, so the absence looks like
 * that defect. It is not: no mobile surface consumes this feature. `apps/customer-mobile` and
 * `apps/shop-mobile` have no delivery-pricing or same-day-declaration screen and this slice adds
 * none. Adding these to the aggregator would generate dead Kotlin.
 *
 * ⚠ Money crosses the wire as a DECIMAL STRING, like every other money DTO on this platform. 027
 * shipped a defect from the mirror case: Kotlin serialised an integer quantity as `1.0` and Go's
 * encoding/json refused it. Strings sidestep both float drift and integer-shape mismatch.
 */

import type { DeliveryMethod, DeliveryStatus } from "./delivery";

// ── Pricing rules (admin only) ─────────────────────────────────────────────────────────────────

/**
 * Which axis a band measures. One table, one discriminator — two structurally identical shapes would
 * otherwise mean double the CRUD, the DTOs and the console.
 */
export type DeliveryBandDimension = "distance" | "weight";
export const DELIVERY_BAND_DIMENSIONS: readonly DeliveryBandDimension[] = ["distance", "weight"];

/**
 * One band: everything up to `upperBound` adds `addAmount`.
 *
 * ⚠ UPPER BOUND ONLY, matched by "smallest upperBound >= value". Storing both bounds would make a GAP
 * between two rows representable, and FR-011 exists precisely because a gap must never mean "no fee".
 * A value above every band takes the LAST band — a rule of the pricing core, not of this shape, since
 * a sentinel row (`upperBound: 99999`) would put a magic number into operator-editable data.
 */
export interface DeliveryPriceBandDTO {
  /** Kilometres for `distance`, kilograms for `weight`. Decimal string. */
  upperBound: string;
  /** Added to the base when this band applies. Decimal string. */
  addAmount: string;
}

/**
 * How one delivery method is priced. Exactly one rule per method (FR-007) — same-day may legitimately
 * cost more than standard at the same distance and weight.
 */
export interface DeliveryPricingRuleDTO {
  method: DeliveryMethod;
  /** Charged before any band adds. Decimal string. */
  baseAmount: string;
  /**
   * Fees are rounded UP to a multiple of this. ⚠ Upward, never nearest: rounding to nearest means the
   * platform silently absorbs the difference on roughly half of all orders — a revenue decision
   * disguised as a formatting choice (FR-005).
   */
  roundingStep: string;
  /**
   * The ceiling (FR-012). ⚠ Required, not nullable: a nullable cap makes "unbounded" expressible by
   * omission, and bands ADD — a heavy basket to a remote postcode otherwise produces a number nobody
   * chose. ⚠ Must itself be a multiple of `roundingStep`, or a capped fee is an unrounded fee at
   * exactly the moment the cap binds (SC-003).
   */
  maxAmount: string;
  status: DeliveryStatus;
  distanceBands: DeliveryPriceBandDTO[];
  weightBands: DeliveryPriceBandDTO[];
  /** ⚠ Never null — FR-013/SC-014 require attribution, and a nullable field makes "nobody knows" representable. */
  updatedBy: string;
  updatedAt: string;
}

/** Whole-rule replacement, including the full band sets. Bands are only meaningful as an ordered set. */
export type DeliveryPricingRuleInput = Pick<
  DeliveryPricingRuleDTO,
  "baseAmount" | "roundingStep" | "maxAmount" | "status" | "distanceBands" | "weightBands"
>;

// ── Same-day declarations (shop proposes, admin decides) ───────────────────────────────────────

/**
 * ⚠ FIVE states, and `revoked` / `superseded` are deliberately NOT the same value.
 *
 * An admin withdrawing a shop's same-day service and a shop's own newer declaration being approved
 * both end an approval — but a shop reading its history must be able to tell "they took this away
 * from us" from "our update went live". `superseded` is set by the platform; `revoked` by a person,
 * and only `revoked` carries a note, because only it has a human to explain it.
 */
export type SamedayDeclarationStatus =
  | "pending"
  | "approved"
  | "declined"
  | "revoked"
  | "superseded";

/**
 * One area a shop will serve same-day.
 *
 * ⚠ AN AREA IS A POSTCODE, chosen by locality name. Serviceability is postcode-decided everywhere on
 * this platform, so an area cannot be finer — picking "Alfredton" commits the shop to all TWENTY
 * Ballarat localities. `localityCount` and `places` exist so the console can say so BEFORE the shop
 * confirms; without the disclosure a shop believes it made a narrow commitment when it made a broad
 * one, and first learns otherwise from an order it cannot serve.
 */
export interface SamedayAreaDTO {
  postcode: string;
  /** Every locality this postcode covers — the disclosure, not decoration. */
  places: string[];
  localityCount: number;
}

/** One version of a shop's declaration. Versions are append-only; see `SamedayDeclarationViewDTO`. */
export interface SamedayDeclarationDTO {
  id: string;
  shopId: string;
  offersSameday: boolean;
  /**
   * Wall-clock cutoff in **Australia/Melbourne** — the platform's operating timezone, never the
   * shopper's device clock and never UTC. ⚠ Required whenever `offersSameday` is true: "same-day, no
   * cutoff" is a promise nobody can keep and makes FR-030's withdrawal rule undecidable.
   */
  cutoffTime: string | null;
  status: SamedayDeclarationStatus;
  areas: SamedayAreaDTO[];
  submittedBy: string;
  submittedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

/**
 * What a shop sees about itself.
 *
 * ⚠ `inForce` AND `pending` are BOTH present and both real (FR-018). A single "current declaration"
 * field would force the API to choose which truth to tell, and whichever it chose the other would be
 * invisible — the shop would either think a pending edit was already live, or think an approved one
 * had been lost.
 */
export interface SamedayDeclarationViewDTO {
  /** False when the shop has no postcode, or a postcode with no known location (FR-020). */
  canDeclare: boolean;
  /** Why not, when `canDeclare` is false — so the console can explain BEFORE a form is filled in. */
  cannotDeclareReason: "shop_location_required" | "shop_location_unmappable" | null;
  inForce: SamedayDeclarationDTO | null;
  pending: SamedayDeclarationDTO | null;
  lastDecision: SamedayDeclarationDTO | null;
}

/** What a shop submits. ⚠ No status field — FR-021: a shop cannot approve itself, even by asking. */
export interface SamedayDeclarationInput {
  offersSameday: boolean;
  cutoffTime: string | null;
  postcodes: string[];
}

// ── The approval queue (admin only) ────────────────────────────────────────────────────────────

/**
 * One requested area as an admin sees it at approval time.
 *
 * ⚠ `straightLineKm` IS NAMED FOR WHAT IT IS. Calling it `distanceKm` would let an admin read it as
 * road distance and decide on a figure that is ~7% optimistic. FR-023 exists because the check this
 * replaces reported "a shop is nearby" while meaning 98 km — replacing one misleading signal with
 * another would be worse than leaving it alone.
 *
 * ⚠ `null` means NO KNOWN LOCATION and must render as such — never as `0`, never as a blank cell that
 * reads as "close". `localityCount` sits beside it so a centroid averaged over 41 places spanning
 * three states (0872) is visible as the nonsense it is.
 */
export interface DeclarationAreaReviewDTO extends SamedayAreaDTO {
  straightLineKm: number | null;
}

/** A declaration awaiting (or having received) a decision, with the distances that inform it. */
export interface DeclarationReviewDTO {
  id: string;
  shopId: string;
  shopName: string;
  shopPostcode: string | null;
  offersSameday: boolean;
  cutoffTime: string | null;
  status: SamedayDeclarationStatus;
  submittedBy: string;
  submittedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  areas: DeclarationAreaReviewDTO[];
  /** Convenience for the queue table; null when no requested area has a known location. */
  furthestKm: number | null;
}

/** An admin's decision. ⚠ A decline MUST carry a reason the shop can read (FR-024). */
export interface DeclarationDecisionDTO {
  note: string | null;
}
