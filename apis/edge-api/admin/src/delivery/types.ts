// Domain types for back-office delivery-zones & pricing management (021-delivery-zones-pricing).
// Wire DTOs live in @effy/shared-types and are mapped explicitly in the handlers; these are the
// internal domain shapes and never leak wire concerns (constitution Principle VI). Mirrors the 009
// shops slice. See data-model.md §1–§4 and contracts/delivery-api.contract.md §C.

export type DeliveryStatus = "active" | "disabled";
export type DeliveryMethod = "same_day" | "scheduled" | "standard";

export const DELIVERY_STATUSES: readonly DeliveryStatus[] = ["active", "disabled"];
export const DELIVERY_METHODS: readonly DeliveryMethod[] = ["same_day", "scheduled", "standard"];

export interface DeliveryZone {
  id: string;
  code: string;
  name: string;
  status: DeliveryStatus;
  postcodeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ZonePostcode {
  id: string;
  postcode: string;
}

export interface Offering {
  id: string;
  originZoneId: string;
  originZoneName: string;
  destinationZoneId: string;
  destinationZoneName: string;
  method: DeliveryMethod;
  priceAmount: string;
  leadDaysMin: number;
  leadDaysMax: number;
  sameDayCutoff: string | null;
  status: DeliveryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ShopLocation {
  shopId: string;
  shopCode: string;
  shopName: string;
  postcode: string | null;
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

// Domain exception → mapped to problem+json in the handler (no HTTP concern here).
export type DeliveryErrorKind =
  | "validation" // → 400
  | "unprocessable" // → 422 (032: a well-formed body whose CONTENT is refused — see below)
  | "conflict" // → 409 (duplicate zone code, postcode already zoned, duplicate offering)
  | "not_found"; // → 404

/**
 * ⚠ WHY 032 ADDS A 422 RATHER THAN REUSING 400 (which every earlier slice uses for body validation).
 *
 * The pricing refusals are not about a malformed request — the JSON parses, the types are right, the
 * numbers are numbers. They are about a CONFIGURATION that would quietly do the wrong thing: a cap
 * below the floor makes every fee the cap (a silently flat price table); an empty band set prices
 * everything at the base; a cap that is not a multiple of the rounding step produces an unrounded fee
 * on exactly the most expensive orders. Each is well-formed and semantically refused, which is what
 * 422 means (RFC 9110 §15.5.21).
 *
 * ⚠ Each refusal carries a stable `code`, because "invalid" tells an operator nothing about which of
 * six rules they broke — the same reasoning behind 027's eight distinguishable promo refusals.
 */
export type DeliveryRefusalCode =
  | "reason_required"
  | "bands_required"
  | "duplicate_band"
  | "invalid_rounding"
  | "cap_below_floor"
  | "cap_not_rounded";

export interface FieldIssue {
  field: string;
  message: string;
}

export class DeliveryError extends Error {
  constructor(
    readonly kind: DeliveryErrorKind,
    message: string,
    readonly fields?: FieldIssue[],
    /** Stable machine-readable refusal code (032). Present on `unprocessable` errors. */
    readonly code?: DeliveryRefusalCode,
  ) {
    super(message);
    this.name = "DeliveryError";
  }
}

export function isDeliveryError(err: unknown): err is DeliveryError {
  return err instanceof DeliveryError;
}

/* ── 031-delivery-areas ────────────────────────────────────────────────────────────────────────
 *
 * ⚠ AN AREA IS A POSTCODE. It is CHOSEN by locality name in the console, but serviceability is
 * decided by postcode everywhere — delivery.ZoneForPostcode is shared by the storefront's answer and
 * checkout's DestinationZone (025 FR-014b). That gap between how an area is picked and what it means
 * is why the interface must disclose every other place a postcode covers (FR-006).
 */

/** The three states an area can be in. ⚠ `unconfigured` is the ABSENCE of a decision, never a stored value. */
export type AreaState = "configured" | "not_served" | "unconfigured";

export type AreaDecisionValue = "served" | "not_served";

export interface AreaDecision {
  decision: AreaDecisionValue;
  note: string | null;
  /** ⚠ The deciding admin's Cognito `sub`, not an email or display name. Joined to admin.staff for display. */
  decidedBy: string;
  decidedAt: string;
}

/** One method's configuration for an area. */
export interface AreaServiceLevel {
  method: DeliveryMethod;
  enabled: boolean;
  feeAmount: string | null;
  leadDaysMin: number | null;
  leadDaysMax: number | null;
  sameDayCutoff: string | null;
}

/** Everything one area gets, in one shape — FR-022 answers this in a single request. */
export interface Area {
  zoneId: string;
  zoneCode: string;
  postcode: string;
  /** The places this postcode covers, by name. Empty = no locality knows it (the 3001 case). */
  places: { name: string; state: string }[];
  state: AreaState;
  decision: AreaDecision | null;
  serviceLevels: AreaServiceLevel[];
  /**
   * ⚠ Other areas in the same zone. `delivery_offering` is keyed on ZONE, so configuring this area
   * configures them too — FR-006's problem one level up. Without this the editor cannot disclose it,
   * and an admin changes Bendigo believing they changed Ballarat.
   */
  siblingPostcodes: string[];
  /** ⚠ The input to the same-day judgement (FR-017) — shown, never computed into a radius. */
  shops: AreaShopFeasibility[];
}

/**
 * A shop that could serve an area, for the same-day judgement (FR-017).
 *
 * ⚠ `inZone` is stated as exactly what it is — "this shop's postcode resolves to the area's zone" —
 * and NOT dressed up as a distance. The platform has no routing capability, and invented precision on
 * a promise is worse than an honest human judgement (research R6).
 * ⚠ `postcode` is nullable on public.shop (021): a shop with no location set resolves to no zone and
 * is surfaced separately, never silently hidden.
 */
export interface AreaShopFeasibility {
  shopId: string;
  shopCode: string;
  shopName: string;
  postcode: string | null;
  inZone: boolean;
}

/** The three configuration defects, each a list rather than a count so an admin can act on them. */
export interface AreaHealth {
  /** ⚠ The 3001 class: an area no locality names. */
  unknownPlace: { zoneCode: string; postcode: string }[];
  /** ⚠ The REGIONAL class: nobody decided, and nothing is offered. */
  unconfigured: { zoneCode: string; postcode: string }[];
  emptyZones: { zoneCode: string }[];
}

/* ── 032-delivery-pricing ──────────────────────────────────────────────────────────────────────
 *
 * ⚠ PRICING RULES REPLACE delivery_offering.price_amount AS THE SINGLE SOURCE OF A DELIVERY FEE.
 * The rate grid above (Offering) keeps the window, the lead time and whether a leg is offered at all;
 * it no longer decides what anything costs. Two sources for one answer is the defect class this
 * feature exists to remove, so the column is dropped rather than deprecated.
 *
 * ⚠ NO SHOP CAN REACH ANY OF THIS. There is no pricing route on apis/edge-api/shop at any verb, which
 * is how FR-008 is enforced — by route topology, not by a check somebody could forget.
 */

/** Which axis a band measures. */
export type BandDimension = "distance" | "weight";

/**
 * One band: everything up to `upperBound` adds `addAmount`.
 *
 * ⚠ UPPER BOUND ONLY. Storing both bounds would make a GAP between two bands representable, and
 * FR-011 exists precisely because a gap must never mean "no fee".
 */
export interface PriceBand {
  /** Kilometres (distance) or kilograms (weight), as a decimal string. */
  upperBound: string;
  addAmount: string;
}

/** How one delivery method is priced. Exactly one per method (FR-007). */
export interface PricingRule {
  method: DeliveryMethod;
  baseAmount: string;
  /** ⚠ Fees round UP to a multiple of this — never to nearest (FR-005). */
  roundingStep: string;
  /** ⚠ Required ceiling (FR-012); bands ADD, and without one an extreme order produces a number nobody chose. */
  maxAmount: string;
  status: DeliveryStatus;
  distanceBands: PriceBand[];
  weightBands: PriceBand[];
  /** ⚠ Never null — FR-013/SC-014 require every pricing change to name a person. */
  updatedBy: string;
  updatedAt: string;
}

/** Whole-rule replacement. ⚠ Bands are only meaningful as a SET — a per-band write would let a quote
 *  in flight observe a half-edited table. */
export interface PricingRuleInput {
  baseAmount: string;
  roundingStep: string;
  maxAmount: string;
  status: DeliveryStatus;
  distanceBands: PriceBand[];
  weightBands: PriceBand[];
}

/* ── 032: same-day declarations & approvals ────────────────────────────────────────────────────
 *
 * ⚠ ELIGIBILITY IS PER SHOP; PRICE IS NOT. 031 collapsed the origin dimension, arguing a shopper
 * cannot perceive which shop serves them. That is true for PRICE and false for ELIGIBILITY —
 * whether same-day is physically possible depends entirely on which shop holds the goods.
 */

/**
 * ⚠ `revoked` and `superseded` are DIFFERENT FACTS and must not share a value.
 *
 * An admin withdrawing a shop's same-day service and a shop's own newer declaration being approved
 * both end an approval, but a shop reading its history has to tell "they took this away from us"
 * from "our update went live". `superseded` is set by the platform and carries no note; `revoked` is
 * set by a person and requires one.
 */
export type DeclarationStatus = "pending" | "approved" | "declined" | "revoked" | "superseded";

/** One requested area as an admin sees it at approval time. */
export interface DeclarationAreaReview {
  postcode: string;
  places: string[];
  localityCount: number;
  /**
   * ⚠ NAMED FOR WHAT IT IS. Calling this `distanceKm` would let an admin read it as road distance and
   * decide on a figure ~7% optimistic. FR-023 exists because the check this replaces reported "a shop
   * is nearby" while meaning 98 km — swapping one misleading signal for another would be worse than
   * leaving it alone.
   *
   * ⚠ NULL means NO KNOWN LOCATION and must render as such — never as 0, never as a blank cell that
   * reads as "close".
   */
  straightLineKm: number | null;
}

export interface DeclarationReview {
  id: string;
  shopId: string;
  shopName: string;
  shopPostcode: string | null;
  offersSameday: boolean;
  cutoffTime: string | null;
  status: DeclarationStatus;
  submittedBy: string;
  submittedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  areas: DeclarationAreaReview[];
  /** For the queue table. Null when no requested area has a known location. */
  furthestKm: number | null;
}
