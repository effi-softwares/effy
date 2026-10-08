/**
 * Delivery — back-office configuration contracts (047-delivery-shipping-engine).
 *
 * Contract: `specs/047-delivery-shipping-engine/contracts/delivery-admin-api.contract.md`.
 *
 * The SSOT the `edge-api/admin` delivery domain and the back-office console share (Principle
 * II). ⚠ This surface VALIDATES a plan but never computes a customer fee — the engine's one home is
 * `@effy/edge-shared/delivery`. Every mutation is attributed via `admin.audit_log`.
 *
 * ⚠ Money / factors / coordinates / km are `numeric` DB columns and cross the wire as decimal STRINGS
 * (exact, no float); grams / ordinal / buffer / counts are integers (`number`).
 */

import type { AustralianState, CoverageKind, DeliveryMethod } from "./delivery";

export type RingStatus = "active" | "disabled";

/** A distance tier. `suggestUpperKm` is null on exactly one (open-ended, furthest) ring. */
export interface RingDTO {
  id: string;
  code: string;
  name: string;
  ordinal: number;
  suggestUpperKm: string | null;
  status: RingStatus;
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

/** A daily driver collection run. Times are Australia/Melbourne wall-clock ("HH:MM"). */
export interface CollectionRunDTO {
  id: string;
  runTime: string;
  label: string | null;
  status: RingStatus;
}

/** The singleton delivery settings: the hub every distance is measured from, and the same-day prep buffer. */
export interface DeliverySettingsDTO {
  hubLatitude: string;
  hubLongitude: string;
  samedayPrepBufferMin: number;
  /**
   * 076 — present on the answer to a save that MOVED the hub: what happened to the list's distances
   * (FR-012). Worked-out ones were recalculated; hand-entered ones were left alone and flagged.
   */
  distances?: HubRecomputeDTO;
}

/** What a hub move did to the coverage list's distances (076 FR-012). */
export interface HubRecomputeDTO {
  /** Worked-out distances that changed. */
  recomputed: number;
  /** Worked-out distances that came out the same, or could no longer be worked out and were kept. */
  unchanged: number;
  /** Hand-entered distances, left as they were and flagged for a person to review. */
  manualFlagged: number;
}

// ── 076 — Effy delivery coverage ───────────────────────────────────────────────────────────────────
//
// ONE list of postcodes Effy delivers to, optionally filed under groups. ⚠ These are STAFF contracts:
// they carry groups, distances and reasons that a customer contract must never carry (FR-023).

/** How a listed postcode's distance was obtained (FR-010). */
export type DistanceSource = "computed" | "manual";

/** Why a postcode has the answer it has — shown to staff, never to a customer. */
export type CoverageReason = "listed" | "courier_offered" | "courier_off" | "courier_excluded" | "unknown_postcode";

/** One postcode on Effy's list. */
export interface CoveragePostcodeDTO {
  postcode: string;
  /** Every place the postcode covers, most addresses first. */
  places: string[];
  state: AustralianState | null;
  groupId: string | null;
  /** Straight-line km from the hub, 2-dp decimal string. */
  distanceKm: string;
  distanceSource: DistanceSource;
  /** A hand-entered distance someone should look at again (the hub moved, or it came from the 076 backfill). */
  needsReview: boolean;
}

/** A name staff file postcodes under. It changes nothing a customer sees, is offered or pays (FR-014). */
export interface CoverageGroupDTO {
  id: string;
  name: string;
  postcodeCount: number;
  /**
   * Drivers cleared to DELIVER to this group (or to everywhere). ⚠ Until the driver-operations
   * feature (E8) a driver is cleared per group, so zero here means orders would be sold and nobody
   * could be given them.
   */
  driverCount: number;
}

/** Courier reach: offered everywhere in the country except the exclusions — once it can be switched on. */
export interface CourierReachDTO {
  offered: boolean;
  /** False until a courier order can actually be placed; the switch is refused while it is. */
  canBeOffered: boolean;
  exclusions: CourierExclusionDTO[];
}

export interface CourierExclusionDTO {
  postcode: string;
  places: string[];
  reason: string;
}

/** `GET /admin/v1/delivery/coverage` — everything the Coverage screen shows, in one read. */
export interface CoverageListDTO {
  postcodes: CoveragePostcodeDTO[];
  nextCursor?: string;
  groups: CoverageGroupDTO[];
  /** Listed postcodes in no group, and the drivers who can deliver to them (those cleared for everywhere). */
  ungrouped: { postcodeCount: number; driverCount: number };
  courier: CourierReachDTO;
  counts: { listed: number; manualDistance: number; needsReview: number };
}

/** One result of the add dialog's place search — a postcode, with the place that matched. */
export interface CoveragePlaceResultDTO {
  postcode: string;
  state: AustralianState | null;
  /** The place name that matched what was typed (or the primary place, for a postcode search). */
  matched: string;
  /** Every place that comes with this postcode (FR-003). */
  places: string[];
  listed: boolean;
  /** null → no place in the postcode has a location; a distance must be entered by hand (FR-009). */
  computedDistanceKm: string | null;
}

export interface CoveragePlaceSearchDTO {
  results: CoveragePlaceResultDTO[];
}

/** `POST /admin/v1/delivery/coverage/postcodes`. */
export interface AddCoveragePostcodesRequest {
  postcodes: { postcode: string; manualDistanceKm?: string | null }[];
  groupId?: string | null;
  /** Staff have been told no driver can deliver there, and are going ahead. */
  confirmNoDrivers?: boolean;
}

export interface AddCoveragePostcodesResult {
  added: string[];
  alreadyListed: string[];
}

/** `PATCH /admin/v1/delivery/coverage/postcodes` — move between groups, or set ONE postcode's distance. */
export interface PatchCoveragePostcodesRequest {
  postcodes: string[];
  /** Present (even as null = no group) → move them. */
  groupId?: string | null;
  distance?: { source: "manual"; km: string } | { source: "computed" };
  confirmNoDrivers?: boolean;
}

/** One answer of the staff checker (FR-025). */
export interface CoverageCheckDTO {
  postcode: string;
  places: string[];
  state: AustralianState | null;
  coverage: CoverageKind;
  reason: CoverageReason;
  groupName: string | null;
  distanceKm: string | null;
  distanceSource: DistanceSource | null;
  /** Staff's own words for why couriers do not go there, when `reason` is `courier_excluded`. */
  exclusionReason: string | null;
}

/** `GET /admin/v1/delivery/coverage/check?q=` — one entry for a postcode, one per postcode for a place name. */
export interface CoverageCheckResultDTO {
  matches: CoverageCheckDTO[];
}

/**
 * A same-day delivery slot, as the back-office sees it (069). Times are Australia/Melbourne
 * wall-clock ("HH:MM"), like a collection run.
 */
export interface DeliverySlotDTO {
  id: string;
  startTime: string;
  endTime: string;
  cutoffTime: string;
  /** How many deliveries the slot takes per day. ⚠ `null` = no limit, which is the default. */
  capacity: number | null;
  status: RingStatus;
  /** Confirmed bookings plus holds that have not lapsed, for today (Melbourne). */
  bookedToday: number;
  /** Late payers honoured above capacity today (FR-009b). Normally zero; always zero with no limit. */
  overCapacityToday: number;
  updatedAt: string;
}

export interface DeliverySlotInput {
  startTime: string;
  endTime: string;
  cutoffTime: string;
  /** Omitted or `null` = no limit. In a PATCH, `null` removes a limit and an absent key keeps it. */
  capacity?: number | null;
}

/** PATCH: any of the four, and/or the status. A slot is never deleted. */
export type DeliverySlotPatch = Partial<DeliverySlotInput> & { status?: RingStatus };

/** One date with no standard delivery. */
export interface NonDeliveryDateDTO {
  day: string;
  label: string | null;
  /** Placed orders already promised this day. They are not changed (FR-043). */
  affectedOrders: number;
}

/** Which days standard delivery runs, and the timings the day rules depend on (069). */
export interface DeliveryDaysDTO {
  lookaheadDays: number;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  noDeliveryWeekdays: number[];
  /** Hub handover → delivered. ⚠ A stated assumption until there is a carrier contract. */
  carrierLeadDays: number;
  slotHoldMin: number;
  /** Collection run → ready to leave the hub. ⚠ A stated assumption until a round is timed. */
  hubTurnaroundMin: number;
  dates: NonDeliveryDateDTO[];
}

export type DeliveryDaysInput = Omit<DeliveryDaysDTO, "dates">;

export interface NonDeliveryDateInput {
  day: string;
  label?: string | null;
}

/** Shop-side product weight (used by the shop products domain, not the admin console). */
export interface ProductWeightDTO {
  weightGrams: number;
  weightIsAssumed: boolean;
}

export type { DeliveryMethod };
