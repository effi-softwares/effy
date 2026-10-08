/**
 * Delivery — back-office configuration contracts (047-delivery-shipping-engine; fee plans rebuilt by
 * 077-delivery-fee-engine-v2).
 *
 * Contracts: `specs/047-delivery-shipping-engine/contracts/delivery-admin-api.contract.md`,
 * `specs/077-delivery-fee-engine-v2/contracts/routes.md`.
 *
 * The SSOT the `edge-api/admin` delivery domain and the back-office console share (Principle
 * II). ⚠ This surface VALIDATES a plan but never computes a customer fee — the engine's one home is
 * `@effy/edge-shared/delivery`. Every mutation is attributed via `admin.audit_log`.
 *
 * ⚠ Money / coordinates / km are `numeric` DB columns and cross the wire as decimal STRINGS
 * (exact, no float); grams / ordinal / buffer / counts are integers (`number`).
 */

import type { AustralianState, CoverageKind, DeliveryMethod } from "./delivery";
import type { DeliveryFeeDTO } from "./delivery-fee";

/** A configured thing that is switched on or off. (Named for the 047 distance tier, which 077 removed.) */
export type ActiveStatus = "active" | "disabled";
/** @deprecated 077 — the tiers are gone; use `ActiveStatus`. Kept so existing slot/run code reads unchanged. */
export type RingStatus = ActiveStatus;

/** A weight slab within a plan (upper-bound band). */
export interface WeightBandDTO {
  upperGrams: number;
  addAmount: string;
}

// ── 077 — fee plans ─────────────────────────────────────────────────────────────────────────────

export type FeePlanKind = "effy" | "courier";

/** Derived, never stored: never activated · the one in force · activated once and since replaced. */
export type FeePlanState = "draft" | "active" | "retired";

/** A distance band: deliveries up to `upperKm` add `addAmount`. `null` = "and beyond" (exactly one). */
export interface DistanceBandDTO {
  upperKm: string | null;
  addAmount: string;
}

/** What a plan adds for one delivery window, with enough about the window to show it. */
export interface SlotPremiumDTO {
  slotId: string;
  /** "17:00–19:00" — the window's times, for display. */
  label: string;
  /** False when the window is switched off: the surcharge is kept and never applies. */
  slotActive: boolean;
  addAmount: string;
}

/**
 * Something a draft is missing before it can go live. ⚠ Not a value error — a bad amount is refused
 * when the plan is saved, as a field error. The two that do not block need a person's attention only.
 */
export type PlanGapCode =
  | "distance_bands_missing"
  | "distance_open_band_missing"
  | "weight_bands_missing"
  | "distance_not_monotonic"
  | "weight_not_monotonic"
  | "floor_is_zero"
  | "premium_on_disabled_slot";

export interface PlanGapDTO {
  code: PlanGapCode;
  blocking: boolean;
  /** The facts the sentence needs — e.g. the two bands that are out of order. */
  detail: Record<string, string | number | null>;
}

/** What staff enter. The same shape creates a draft and replaces one. */
export interface FeePlanInput {
  kind: FeePlanKind;
  name: string;
  /** Effy: the base. Courier: the flat amount per order. */
  baseAmount: string;
  /** Effy only; empty for a courier plan. */
  distanceBands: DistanceBandDTO[];
  /** The heaviest band also prices everything above it. */
  weightBands: WeightBandDTO[];
  freeOverAmount: string | null;
  /** Effy only. Both set, or neither. */
  smallOrderUnderAmount: string | null;
  smallOrderFeeAmount: string | null;
  /** Effy only. Added when the chosen window is today. */
  todayPremiumAmount: string;
  /** Effy only. */
  slotPremiums: { slotId: string; addAmount: string }[];
  roundingStepAmount: string;
  floorAmount: string;
  capAmount: string;
}

/** A fee plan as staff see it. Exactly one is active per kind. */
export interface FeePlanDTO extends Omit<FeePlanInput, "slotPremiums"> {
  id: string;
  state: FeePlanState;
  slotPremiums: SlotPremiumDTO[];
  gaps: PlanGapDTO[];
  createdBy: string;
  createdAt: string;
  activatedBy: string | null;
  activatedAt: string | null;
}

export interface PlanActivationRequest {
  /** Required true to activate a plan whose minimum fee is $0. */
  confirmZeroFloor?: boolean;
}

/** The body of a 409 `plan_incomplete`. */
export interface PlanIncompleteDTO {
  code: "plan_incomplete";
  gaps: PlanGapDTO[];
}

/** Try a plan: what would this delivery cost, and why? Read-only. */
export interface FeeSimulationRequest {
  /** null = the active plan of the kind the postcode resolves to. */
  planId: string | null;
  postcode: string;
  grams: number;
  basketAmount: string;
  slotId: string | null;
  windowIsToday: boolean;
  /**
   * Price as a courier order whatever the postcode's coverage. Courier delivery cannot be switched
   * on yet, so without this a courier table could not be tried at all.
   */
  forceKind?: "courier";
}

export interface FeeSimulationStepDTO {
  label: string;
  detail: string;
  /** Signed 2-dp amount; empty for a step that only explains. */
  amount: string;
}

export interface FeeSimulationDTO {
  coverage: CoverageKind;
  plan: { id: string; name: string; kind: FeePlanKind; state: FeePlanState } | null;
  /** What the customer would see; null when nobody delivers there. */
  fee: DeliveryFeeDTO | null;
  steps: FeeSimulationStepDTO[];
  note: string | null;
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
  /**
   * 078 — how full this window is on each offered day, in the order of the response's `days`.
   * Absent on the create/update responses and from a server older than 078.
   */
  load?: DeliverySlotLoadDTO[];
  updatedAt: string;
}

/** 078 — one window's bookings on one day. Confirmed bookings plus holds that have not lapsed. */
export interface DeliverySlotLoadDTO {
  /** yyyy-mm-dd (Melbourne). */
  date: string;
  booked: number;
  /** Late payers honoured above the limit that day. */
  overCapacity: number;
}

/** 078 — a column of the windows grid: today, then the next Effy delivery days. */
export interface DeliverySlotDayDTO {
  date: string;
  isToday: boolean;
  /** Only ever true for today: a later non-delivery day is skipped, not listed. */
  nonDelivery: boolean;
}

/** `GET /fleet/v1/delivery-slots`. `days` is absent from a server older than 078. */
export interface DeliverySlotsResponseDTO {
  items: DeliverySlotDTO[];
  days?: DeliverySlotDayDTO[];
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
  /**
   * 078 — how many Effy DELIVERY days after today a customer may choose a window on (1–14).
   * Non-delivery days do not count. Used once the new delivery model is on.
   */
  effyLookaheadDays: number;
  dates: NonDeliveryDateDTO[];
}

/** ⚠ `effyLookaheadDays` is optional on input: absent keeps the stored value (a console built before 078). */
export type DeliveryDaysInput = Omit<DeliveryDaysDTO, "dates" | "effyLookaheadDays"> & { effyLookaheadDays?: number };

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
