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
