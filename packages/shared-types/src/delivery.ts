/**
 * Delivery zones & pricing management contracts — 021-delivery-zones-pricing.
 *
 * The back-office surface for the delivery map: serviced areas (postcode sets), each shop's origin
 * location, and the per-(origin zone → destination zone, method) rate grid. Consumed by `apps/back-office`
 * against `apis/edge-api/admin` (cold path). Mirrors the 009 shop-management contract shape; reuses the
 * generic `PagedDTO<T>` and `AuditEntryDTO` from `shop.ts`.
 *
 * These are the OPERATOR's view — full identity is fine here (back-office staff manage zones and shop
 * locations). NONE of this reaches a customer surface; the customer sees anonymous packages only (021
 * FR-019).
 */

/** Zone / offering lifecycle. A disabled zone or offering is not used for NEW quotes; history is untouched. */
export type DeliveryStatus = "active" | "disabled";
export const DELIVERY_STATUSES: readonly DeliveryStatus[] = ["active", "disabled"];

/** The three service levels. Availability is per (origin zone → destination zone); never per shop. */
export type DeliveryMethod = "same_day" | "scheduled" | "standard";
export const DELIVERY_METHODS: readonly DeliveryMethod[] = ["same_day", "scheduled", "standard"];

/** A serviced area — a named set of AU postcodes. */
export interface DeliveryZoneDTO {
  id: string;
  code: string;
  name: string;
  status: DeliveryStatus;
  postcodeCount: number;
  createdAt: string;
  updatedAt: string;
}

/** One postcode assigned to a zone (a postcode belongs to at most one zone). */
export interface DeliveryZonePostcodeDTO {
  id: string;
  postcode: string;
}

/** A rate: the price and window that make a method real for an (origin zone → destination zone) leg. */
export interface DeliveryOfferingDTO {
  id: string;
  originZoneId: string;
  originZoneName: string;
  destinationZoneId: string;
  destinationZoneName: string;
  method: DeliveryMethod;
  priceAmount: string;
  leadDaysMin: number;
  leadDaysMax: number;
  /** HH:mm, only meaningful for method='same_day'; null otherwise. */
  sameDayCutoff: string | null;
  status: DeliveryStatus;
  createdAt: string;
  updatedAt: string;
}

/** A shop's origin location (postcode). Managed here; NEVER exposed to customers (FR-019). */
export interface ShopLocationDTO {
  shopId: string;
  shopCode: string;
  shopName: string;
  postcode: string | null;
}

// ── Requests ─────────────────────────────────────────────────────────────────────────────────────

export interface CreateZoneRequest {
  code: string;
  name: string;
}

export interface UpdateZoneRequest {
  name?: string;
  status?: DeliveryStatus;
}

export interface AddPostcodesRequest {
  /** One or more postcodes to assign to the zone. A postcode already in a zone → 409. */
  postcodes: string[];
}

export interface CreateOfferingRequest {
  originZoneId: string;
  destinationZoneId: string;
  method: DeliveryMethod;
  priceAmount: string;
  leadDaysMin: number;
  leadDaysMax: number;
  sameDayCutoff?: string | null;
}

export interface UpdateOfferingRequest {
  priceAmount?: string;
  leadDaysMin?: number;
  leadDaysMax?: number;
  sameDayCutoff?: string | null;
  status?: DeliveryStatus;
}

export interface SetShopLocationRequest {
  /** The shop's origin postcode. Null clears it (→ the shop's packages become undeliverable). */
  postcode: string | null;
}

/* ── 031-delivery-areas: per-area configuration ────────────────────────────────────────────────
 *
 * ⚠ `LocalityDTO` is REUSED UNCHANGED from `./storefront` — the operator's place search returns the
 * same shape the shopper's does. One table, one contract, two audiences (Principle II). Do NOT
 * declare a second locality type here.
 */

/** ⚠ `unconfigured` is the ABSENCE of a decision, never a stored value — see the 031 migration. */
export type AreaState = "configured" | "not_served" | "unconfigured";

export type AreaDecisionValue = "served" | "not_served";

export interface AreaDecisionDTO {
  decision: AreaDecisionValue;
  note: string | null;
  /** The deciding admin's Cognito `sub`. The console resolves the display name from admin.staff. */
  decidedBy: string;
  decidedAt: string;
}

export interface AreaServiceLevelDTO {
  method: DeliveryMethod;
  enabled: boolean;
  feeAmount: string | null;
  leadDaysMin: number | null;
  leadDaysMax: number | null;
  sameDayCutoff: string | null;
}

export interface AreaDTO {
  zoneId: string;
  zoneCode: string;
  postcode: string;
  /** The places this postcode covers. ⚠ Empty means no locality names it — the 3001 case. */
  places: { name: string; state: string }[];
  state: AreaState;
  decision: AreaDecisionDTO | null;
  serviceLevels: AreaServiceLevelDTO[];
  /** ⚠ Other areas in this zone — configuring one configures them all (offerings are zone-keyed). */
  siblingPostcodes: string[];
  /** ⚠ Shops that might serve this area. `inZone` is zone membership, NOT a distance. */
  shops: AreaShopFeasibilityDTO[];
}

/** What a postcode actually covers — ⚠ the data behind the FR-006 disclosure. */
export interface PostcodeCoverageDTO {
  postcode: string;
  places: { name: string; state: string; postcode: string }[];
  /**
   * ⚠ REQUIRED even though the client could take `places.length`.
   *
   * The disclosure sentence is built from this. A client measuring the list it was handed can render
   * "1 other place" when there are twenty, because the list was truncated. The rendered sentence uses
   * `count - 1` ("19 other places" from a count of 20) — the derivation is stated so the client is not
   * left inventing it.
   */
  count: number;
}

/** A shop that might serve an area. ⚠ `inZone` is zone membership, NOT a distance (031 research R6). */
export interface AreaShopFeasibilityDTO {
  shopId: string;
  shopCode: string;
  shopName: string;
  postcode: string | null;
  inZone: boolean;
}

export interface AreaHealthDTO {
  unknownPlace: { zoneCode: string; postcode: string }[];
  unconfigured: { zoneCode: string; postcode: string }[];
  emptyZones: { zoneCode: string }[];
}


export interface MarkAreaNotServedRequest {
  note?: string | null;
}
