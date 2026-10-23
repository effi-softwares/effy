/**
 * Delivery: back-office configuration contracts, shared by the admin delivery domain and the console.
 * This surface validates a plan but never computes a customer fee (that is `@effy/edge-shared/delivery`).
 * Money, coordinates and km are decimal strings; grams, ordinals and counts are integers.
 */

import type { AustralianState, CoverageKind, DeliveryMethod } from "./delivery";
import type { DeliveryFeeDTO } from "./delivery-fee";

/** A configured thing that is switched on or off. */
export type ActiveStatus = "active" | "disabled";

/** A weight slab within a plan (upper-bound band). */
export interface WeightBandDTO {
  upperGrams: number;
  addAmount: string;
}

// Fee plans

export type FeePlanKind = "effy" | "courier";

/** Derived, never stored: never activated, the one in force, or activated once and since replaced. */
export type FeePlanState = "draft" | "active" | "retired";

/** A distance band: deliveries up to `upperKm` add `addAmount`; `null` is "and beyond" (exactly one). */
export interface DistanceBandDTO {
  upperKm: string | null;
  addAmount: string;
}

/** What a plan adds for one delivery window, with enough about the window to show it. */
export interface SlotPremiumDTO {
  slotId: string;
  /** "17:00–19:00": the window's times, for display. */
  label: string;
  /** False when the window is off: the surcharge is kept but never applies. */
  slotActive: boolean;
  addAmount: string;
}

/** Something a draft lacks before it can go live (a bad amount is a field error on save instead). Two kinds only need attention. */
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
  /** The facts the sentence needs (e.g. the two bands out of order). */
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

/** Try a plan: what would this delivery cost, and why? Read-only. */
export interface FeeSimulationRequest {
  /** null: the active plan of the kind the postcode resolves to. */
  planId: string | null;
  postcode: string;
  grams: number;
  basketAmount: string;
  slotId: string | null;
  windowIsToday: boolean;
  /** Price as a courier order whatever the postcode's coverage, so a courier table can be tried. */
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

/** A daily collection run. Times are Australia/Melbourne wall clock ("HH:MM"). */
export interface CollectionRunDTO {
  id: string;
  runTime: string;
  label: string | null;
  status: ActiveStatus;
}

/** The delivery settings singleton: the hub distances are measured from, and the prep buffer. */
export interface DeliverySettingsDTO {
  hubLatitude: string;
  hubLongitude: string;
  samedayPrepBufferMin: number;
  /** On the answer to a save that moved the hub: worked-out distances recalculated, hand-entered ones flagged. */
  distances?: HubRecomputeDTO;
}

/** What a hub move did to the coverage list's distances. */
export interface HubRecomputeDTO {
  /** Worked-out distances that changed. */
  recomputed: number;
  /** Worked-out distances that came out the same, or could no longer be worked out and were kept. */
  unchanged: number;
  /** Hand-entered distances, left as they were and flagged for review. */
  manualFlagged: number;
}

// Effy delivery coverage: one list of postcodes, optionally filed under groups. Staff contracts: they carry
// groups, distances and reasons a customer contract must never carry.

/** How a listed postcode's distance was obtained. */
export type DistanceSource = "computed" | "manual";

/** Why a postcode has its answer; staff only. */
export type CoverageReason =
  | "listed" | "courier_offered" | "courier_off" | "courier_excluded" | "unknown_postcode"
  /** Courier delivery is on, but no fee table or default courier service is active. */
  | "courier_not_ready";

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
  /** A hand-entered distance to look at again (the hub moved, or it was backfilled). */
  needsReview: boolean;
  /** Whether a window today may be sold here. Per postcode, never per group. */
  todayOffered: boolean;
}

/** A name staff file postcodes under; it changes nothing a customer sees, is offered or pays. */
export interface CoverageGroupDTO {
  id: string;
  name: string;
  postcodeCount: number;
  /** Drivers cleared to deliver to this group (or everywhere). Zero means orders would be sold that nobody can be given. */
  driverCount: number;
}

/** What stops courier delivery being switched on. `no_service`: no active default courier service. */
export type CourierBlocker = "no_fee_table" | "no_service";

/** How a courier order's parcels reach the courier. */
export type CourierCollection = "hub" | "supplier";

/** A courier company's service, entered by the operator; never seeded. */
export interface CourierServiceDTO {
  id: string;
  courierName: string;
  serviceName: string;
  /** What a customer reads after "Usually arrives in …" ("2–4 business days"). */
  estimateText: string;
  /** When a handed-over parcel with no progress is overdue. Staff only. */
  maxBusinessDays: number;
  /** ISO weekdays the courier collects (1 = Monday). */
  pickupWeekdays: number[];
  /** "14:00", Melbourne wall clock. */
  pickupCutoff: string;
  collectsFromSupplier: boolean;
  status: "active" | "retired";
  isDefault: boolean;
}

/** `POST` / `PUT /admin/v1/delivery/courier-services[/{id}]`: every field on create, any on update. */
export interface CourierServiceInput {
  courierName?: string;
  serviceName?: string;
  estimateText?: string;
  maxBusinessDays?: number;
  pickupWeekdays?: number[];
  pickupCutoff?: string;
  collectsFromSupplier?: boolean;
  status?: "active" | "retired";
  /** True makes this the default (and un-makes the previous one). */
  isDefault?: boolean;
}

export interface CourierServiceListDTO {
  items: CourierServiceDTO[];
  /** How new courier orders reach the courier. Changed through `PUT …/coverage/courier`. */
  collectionDefault: CourierCollection;
}

/** Courier reach: offered everywhere in the country except the exclusions. */
export interface CourierReachDTO {
  offered: boolean;
  /** Offer courier to a listed address when no window is available. */
  whenNoWindows: boolean;
  /** How new courier orders reach the courier. */
  collectionDefault: CourierCollection;
  /** The default courier service, whose timeframe checkout tells; null when none. */
  defaultService: { id: string; label: string; estimateText: string } | null;
  /** Why `offered` cannot be switched on yet; empty when it can. */
  blockedBy: CourierBlocker[];
  exclusions: CourierExclusionDTO[];
}

/** `PUT /admin/v1/delivery/coverage/courier`: any of the three; an absent field is left as it is. */
export interface CourierReachUpdateDTO {
  offered?: boolean;
  whenNoWindows?: boolean;
  collectionDefault?: CourierCollection;
}

export interface CourierExclusionDTO {
  postcode: string;
  places: string[];
  reason: string;
}

/** `GET /admin/v1/delivery/coverage`: everything the Coverage screen shows, in one read. */
export interface CoverageListDTO {
  postcodes: CoveragePostcodeDTO[];
  nextCursor?: string;
  groups: CoverageGroupDTO[];
  /** Listed postcodes in no group, and the drivers cleared for everywhere who can deliver them. */
  ungrouped: { postcodeCount: number; driverCount: number };
  courier: CourierReachDTO;
  /** Listed postcodes where delivery today is not offered (the whole list, not the page). */
  counts: { listed: number; manualDistance: number; needsReview: number; todayNotOffered: number };
}

/** One result of the add dialog's place search: a postcode, with the place that matched. */
export interface CoveragePlaceResultDTO {
  postcode: string;
  state: AustralianState | null;
  /** The place name that matched what was typed (or the primary place, for a postcode search). */
  matched: string;
  /** Every place that comes with this postcode. */
  places: string[];
  listed: boolean;
  /** null: no place in the postcode has a location, so a distance must be entered by hand. */
  computedDistanceKm: string | null;
}

export interface CoveragePlaceSearchDTO {
  results: CoveragePlaceResultDTO[];
}

/** `POST /admin/v1/delivery/coverage/postcodes`. */
export interface AddCoveragePostcodesRequest {
  postcodes: { postcode: string; manualDistanceKm?: string | null }[];
  groupId?: string | null;
  /** Staff were told no driver can deliver there and are going ahead. */
  confirmNoDrivers?: boolean;
  /** Whether delivery today is offered at the postcodes added. Absent = true. */
  todayOffered?: boolean;
}

export interface AddCoveragePostcodesResult {
  added: string[];
  alreadyListed: string[];
}

/** `PATCH /admin/v1/delivery/coverage/postcodes`: move between groups, or set one postcode's distance. */
export interface PatchCoveragePostcodesRequest {
  postcodes: string[];
  /** Present (even null, for no group): move them. */
  groupId?: string | null;
  distance?: { source: "manual"; km: string } | { source: "computed" };
  confirmNoDrivers?: boolean;
  /** Offer (true) or stop offering (false) delivery today at every named postcode. May combine with `groupId`. */
  todayOffered?: boolean;
}

/** One answer of the staff checker. */
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
  /** Whether delivery today is offered there; null when the postcode is not listed. */
  todayOffered: boolean | null;
}

/** `GET /admin/v1/delivery/coverage/check?q=`: one entry for a postcode, one per postcode for a place name. */
export interface CoverageCheckResultDTO {
  matches: CoverageCheckDTO[];
}

/** A delivery window as back-office sees it. Times are Australia/Melbourne wall clock ("HH:MM"). */
export interface DeliverySlotDTO {
  id: string;
  startTime: string;
  endTime: string;
  cutoffTime: string;
  /** Deliveries per day; `null` = no limit (the default). */
  capacity: number | null;
  /** The "Any time" window: its hours are when untimed deliveries go out, its capacity their daily limit. Exactly one, always on; no API sets this. */
  anyTime?: boolean;
  status: ActiveStatus;
  /** Confirmed bookings plus holds that have not lapsed, for today (Melbourne). */
  bookedToday: number;
  /** Late payers honoured above capacity today; normally zero, always zero with no limit. */
  overCapacityToday: number;
  /** How full this window is on each offered day, in the order of `days`. Absent on create/update responses. */
  load?: DeliverySlotLoadDTO[];
  updatedAt: string;
}

/** One window's bookings on one day: confirmed bookings plus holds that have not lapsed. */
export interface DeliverySlotLoadDTO {
  /** yyyy-mm-dd (Melbourne). */
  date: string;
  booked: number;
  /** Late payers honoured above the limit that day. */
  overCapacity: number;
}

/** A column of the windows grid: today, then the next Effy delivery days. */
export interface DeliverySlotDayDTO {
  date: string;
  isToday: boolean;
  /** Only ever true for today: a later non-delivery day is skipped. */
  nonDelivery: boolean;
}

/** `GET /fleet/v1/delivery-slots`. */
export interface DeliverySlotsResponseDTO {
  items: DeliverySlotDTO[];
  days: DeliverySlotDayDTO[];
}

export interface DeliverySlotInput {
  startTime: string;
  endTime: string;
  cutoffTime: string;
  /** Omitted or `null` = no limit. In a PATCH, `null` removes a limit and an absent key keeps it. */
  capacity?: number | null;
}

/** PATCH: any of the four, and/or the status. A slot is never deleted. */
export type DeliverySlotPatch = Partial<DeliverySlotInput> & { status?: ActiveStatus };

/** One date with no standard delivery. */
export interface NonDeliveryDateDTO {
  day: string;
  label: string | null;
  /** Placed orders already promised this day; they are not changed. */
  affectedOrders: number;
}

/** Which days Effy delivers, and the timings the window rules depend on. */
export interface DeliveryDaysDTO {
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  noDeliveryWeekdays: number[];
  slotHoldMin: number;
  /** Collection run → ready to leave the hub; an assumption until a round is timed. */
  hubTurnaroundMin: number;
  /** How many Effy delivery days after today a window may be chosen on (1–14); non-delivery days do not count. */
  effyLookaheadDays: number;
  /** What an "as soon as possible" customer is told to expect, 1–80 characters. Never empty. */
  asapEstimate?: string;
  /** Minutes a delivery run may stay open and unloaded before dispatch is told (5–240). */
  loadOverdueMin?: number;
  /** Minutes a collection run may wait at "heading to the hub" before dispatch is told (5–240). */
  checkinOverdueMin?: number;
  /** Drivers check their vehicle once a day before being given work. Off by default. */
  vehicleCheckRequired?: boolean;
  dates: NonDeliveryDateDTO[];
}

/** In a PUT, an absent `asapEstimate` keeps the one saved. */
export type DeliveryDaysInput = Omit<DeliveryDaysDTO, "dates">;

export interface NonDeliveryDateInput {
  day: string;
  label?: string | null;
}

export type { DeliveryMethod };

