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
  | "conflict" // → 409 (duplicate zone code, postcode already zoned, duplicate offering)
  | "not_found"; // → 404

export interface FieldIssue {
  field: string;
  message: string;
}

export class DeliveryError extends Error {
  constructor(
    readonly kind: DeliveryErrorKind,
    message: string,
    readonly fields?: FieldIssue[],
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
