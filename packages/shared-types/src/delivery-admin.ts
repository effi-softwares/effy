/**
 * Delivery — back-office configuration contracts (047-delivery-shipping-engine).
 *
 * Contract: `specs/047-delivery-shipping-engine/contracts/delivery-admin-api.contract.md`.
 *
 * The SSOT the cold-path `edge-api/admin` delivery domain and the back-office console share (Principle
 * II). ⚠ This surface VALIDATES a plan but never computes a customer fee — the engine's one home is the
 * hot path. Every mutation is attributed via `admin.audit_log`.
 *
 * ⚠ Money / factors / coordinates / km are `numeric` DB columns and cross the wire as decimal STRINGS
 * (exact, no float); grams / ordinal / buffer / counts are integers (`number`).
 */

import type { AustralianState, DeliveryMethod } from "./delivery";

export type RingStatus = "active" | "disabled";
export type ZoneStatus = "active" | "disabled";
export type SameDayMode = "on" | "off";

/** A distance tier. `suggestUpperKm` is null on exactly one (open-ended, furthest) ring. */
export interface RingDTO {
  id: string;
  code: string;
  name: string;
  ordinal: number;
  suggestUpperKm: string | null;
  status: RingStatus;
}

/** A served area. `ringId` is the assigned ring; `suggestedRingId`/`hubDistanceKm` are the last suggestion. */
export interface ZoneDTO {
  id: string;
  code: string;
  name: string;
  ringId: string;
  ringIsOverridden: boolean;
  suggestedRingId: string | null;
  hubDistanceKm: string | null; // internal only — never surfaced to a shopper
  samedayEligible: boolean;
  status: ZoneStatus;
  postcodeCount: number;
}

/** A place the console can add to a zone, with the disclosure that its postcode also serves others (FR-008). */
export interface ZonePostcodeCandidateDTO {
  locality: LocalityChoice;
  /** Every OTHER place the same postcode makes serviceable, and how many (FR-008). */
  alsoServes: LocalityChoice[];
  alsoServesCount: number;
  /** True when no locality matches this postcode — requires explicit confirm to add (FR-010). */
  unknownPostcode: boolean;
  /** Set when the postcode already belongs to another zone (add is refused) (FR-009). */
  inZoneCode: string | null;
}

/** A fully-identified place (mirrors the customer `LocalityDTO`). */
export interface LocalityChoice {
  name: string;
  state: AustralianState;
  postcode: string;
}

/** The pre-add disclosure for a postcode (FR-008/009/010): every place it serves, whether it is unknown,
 *  and whether another zone already holds it. */
export interface PostcodeCheckDTO {
  postcode: string;
  places: LocalityChoice[];
  placeCount: number;
  unknownPostcode: boolean;
  inZoneCode: string | null;
}

/** The places that stop being serviceable if an area is removed (FR-011). */
export interface ZoneRemovalImpactDTO {
  postcode: string;
  places: LocalityChoice[];
  placeCount: number;
}

/** The auto-suggested ring for a zone (FR-015). `ringId` null with a reason when no coordinate is available. */
export interface RingSuggestionDTO {
  ringId: string | null;
  hubDistanceKm: string | null;
  reason: "ok" | "no_coordinate";
}

/** A distance-slab price within a plan. */
export interface RingPriceDTO {
  ringId: string;
  priceAmount: string;
}

/** A weight slab within a plan (upper-bound band). */
export interface WeightBandDTO {
  upperGrams: number;
  addAmount: string;
}

/** A complete, named shipping-fee rule set. Exactly one is active platform-wide (FR-048). */
export interface FeePlanDTO {
  id: string;
  name: string;
  isActive: boolean;
  roundingStep: string;
  floorAmount: string;
  capAmount: string;
  sameDayFactor: string;
  standardFactor: string;
  ringPrices: RingPriceDTO[];
  weightBands: WeightBandDTO[];
  activatedBy: string | null;
  activatedAt: string | null;
}

/** Why a plan cannot be activated (FR-051) — the gap is named. */
export interface PlanActivationRefusalDTO {
  error: "plan_incomplete";
  missingRings: string[]; // ring codes with no price
  reason?: "no_weight_bands";
}

/** A per-(shop, zone) same-day override, set only by back-office (FR-043/045). */
export interface SameDayExceptionDTO {
  id: string;
  shopId: string;
  zoneId: string;
  mode: SameDayMode;
  updatedBy: string;
}

/** A daily driver collection run. Times are Australia/Melbourne wall-clock ("HH:MM"). */
export interface CollectionRunDTO {
  id: string;
  runTime: string;
  label: string | null;
  status: RingStatus;
}

/** The singleton delivery settings: the ring-suggestion hub and the same-day prep buffer. */
export interface DeliverySettingsDTO {
  hubLatitude: string;
  hubLongitude: string;
  samedayPrepBufferMin: number;
}

/** A configuration problem surfaced by the delivery health view (a clean config returns none). */
export interface ZoneHealthFlagDTO {
  zoneCode: string;
  kind: "unknown_place_postcode" | "empty_zone" | "ring_unpriced_in_active_plan";
  detail: string;
}

/** Shop-side product weight (used by the shop products domain, not the admin console). */
export interface ProductWeightDTO {
  weightGrams: number;
  weightIsAssumed: boolean;
}

export type { DeliveryMethod };
