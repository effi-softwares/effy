// Data layer for back-office delivery configuration (047). Every call goes through the shared api
// client to the admin cold-path service (contracts/delivery-admin-api). Screens never touch `api`
// directly (Principle VI). DTOs double as the domain shapes here (identity map).
import type {
  DeliveryDaysDTO,
  DeliveryDaysInput,
  DeliverySettingsDTO,
  DeliverySlotDTO,
  DeliverySlotInput,
  DeliverySlotPatch,
  NonDeliveryDateDTO,
  NonDeliveryDateInput,
  FeePlanDTO,
  RingDTO,
  AddCoveragePostcodesRequest,
  AddCoveragePostcodesResult,
  CoverageCheckResultDTO,
  CoverageListDTO,
  CoveragePlaceSearchDTO,
  PatchCoveragePostcodesRequest,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// ── request payloads (match the edge service's parsed bodies) ─────────────────────────────────────

export interface RingPriceBody {
  ringId: string;
  priceAmount: string;
}
export interface WeightBandBody {
  upperGrams: number;
  addAmount: string;
}
export interface NewPlanBody {
  name: string;
  roundingStep: string;
  floorAmount: string;
  capAmount: string;
  sameDayFactor: string;
  standardFactor: string;
  ringPrices: RingPriceBody[];
  weightBands: WeightBandBody[];
}

// ── rings ─────────────────────────────────────────────────────────────────────────────────────────

export async function listRings(): Promise<RingDTO[]> {
  return (await api.get<{ items: RingDTO[] }>("/admin/v1/delivery/rings")).items;
}

// ── fee plans ───────────────────────────────────────────────────────────────────────────────────

export async function listPlans(): Promise<FeePlanDTO[]> {
  return (await api.get<{ items: FeePlanDTO[] }>("/admin/v1/delivery/plans")).items;
}
export function createPlan(body: NewPlanBody): Promise<FeePlanDTO> {
  return api.post<FeePlanDTO>("/admin/v1/delivery/plans", body);
}
export function activatePlan(planId: string): Promise<FeePlanDTO> {
  return api.post<FeePlanDTO>(`/admin/v1/delivery/plans/${planId}/activate`, {});
}

// ── settings ────────────────────────────────────────────────────────────────────────────────────

// The GET may return nulls when the hub has never been set — treat that as "not configured yet".
export type SettingsRead = {
  hubLatitude: string | null;
  hubLongitude: string | null;
  samedayPrepBufferMin: number | null;
};
export function getSettings(): Promise<SettingsRead> {
  return api.get<SettingsRead>("/admin/v1/delivery/settings");
}
export function putSettings(body: DeliverySettingsDTO): Promise<DeliverySettingsDTO> {
  return api.put<DeliverySettingsDTO>("/admin/v1/delivery/settings", body);
}

// ── Collection runs (047 US2) ────────────────────────────────────────────

export interface CollectionRun {
  id: string;
  runTime: string;
  label: string | null;
  status: string;
}
export async function listCollectionRuns(): Promise<CollectionRun[]> {
  return (await api.get<{ items: CollectionRun[] }>("/admin/v1/delivery/collection-runs")).items;
}
export async function createCollectionRun(runTime: string, label: string | null): Promise<CollectionRun[]> {
  return (await api.post<{ items: CollectionRun[] }>("/admin/v1/delivery/collection-runs", { runTime, label })).items;
}
export async function deleteCollectionRun(id: string): Promise<CollectionRun[]> {
  return (await api.delete<{ items: CollectionRun[] }>(`/admin/v1/delivery/collection-runs/${id}`)).items;
}
// ── 069: same-day slots and the standard-delivery calendar ────────────────────────────────────────
//
// ⚠ THESE LIVE ON THE `fleet` SERVICE, not `admin` like everything above. The admin stack is at its
// CloudFormation resource ceiling, and slots are delivery CAPACITY — the planner that must respect
// them is in fleet. The operator sees one Delivery console; which service answers is not their concern.

export async function listSlots(): Promise<DeliverySlotDTO[]> {
  return (await api.get<{ items: DeliverySlotDTO[] }>("/fleet/v1/delivery-slots")).items;
}
export function createSlot(body: DeliverySlotInput): Promise<DeliverySlotDTO> {
  return api.post<DeliverySlotDTO>("/fleet/v1/delivery-slots", body);
}
/** ⚠ There is no delete: a slot is switched off (`status: "disabled"`), because bookings reference it. */
export function patchSlot(slotId: string, body: DeliverySlotPatch): Promise<DeliverySlotDTO> {
  return api.patch<DeliverySlotDTO>(`/fleet/v1/delivery-slots/${slotId}`, body);
}

export function getDeliveryDays(): Promise<DeliveryDaysDTO> {
  return api.get<DeliveryDaysDTO>("/fleet/v1/delivery-days");
}
export function putDeliveryDays(body: DeliveryDaysInput): Promise<DeliveryDaysDTO> {
  return api.put<DeliveryDaysDTO>("/fleet/v1/delivery-days", body);
}
export function addNonDeliveryDate(body: NonDeliveryDateInput): Promise<NonDeliveryDateDTO> {
  return api.post<NonDeliveryDateDTO>("/fleet/v1/delivery-days/dates", body);
}
export function removeNonDeliveryDate(day: string): Promise<void> {
  return api.delete<void>(`/fleet/v1/delivery-days/dates/${day}`);
}

// ── 076: Effy delivery coverage ───────────────────────────────────────────────────────────────────
//
// ONE list of postcodes Effy delivers to, optionally filed under groups, plus courier reach. These
// replace the 047 zone, ring-create, suggest-ring, postcode-check and same-day-exception calls.

export interface CoverageFilters {
  /** A group id, or "none" for postcodes in no group. */
  group?: string;
  q?: string;
  source?: "computed" | "manual";
  review?: boolean;
}

export function listCoverage(f: CoverageFilters = {}, cursor?: string): Promise<CoverageListDTO> {
  const qs = new URLSearchParams();
  if (f.group) qs.set("group", f.group);
  if (f.q) qs.set("q", f.q);
  if (f.source) qs.set("source", f.source);
  if (f.review) qs.set("review", "true");
  if (cursor) qs.set("cursor", cursor);
  const tail = qs.toString();
  return api.get<CoverageListDTO>(`/admin/v1/delivery/coverage${tail ? `?${tail}` : ""}`);
}
export function searchCoveragePlaces(q: string): Promise<CoveragePlaceSearchDTO> {
  return api.get<CoveragePlaceSearchDTO>(`/admin/v1/delivery/coverage/places?q=${encodeURIComponent(q)}`);
}
export function checkCoverage(q: string): Promise<CoverageCheckResultDTO> {
  return api.get<CoverageCheckResultDTO>(`/admin/v1/delivery/coverage/check?q=${encodeURIComponent(q)}`);
}
export function addCoveragePostcodes(body: AddCoveragePostcodesRequest): Promise<AddCoveragePostcodesResult> {
  return api.post<AddCoveragePostcodesResult>("/admin/v1/delivery/coverage/postcodes", body);
}
export function patchCoveragePostcodes(body: PatchCoveragePostcodesRequest): Promise<void> {
  return api.patch<void>("/admin/v1/delivery/coverage/postcodes", body);
}
export function removeCoveragePostcode(postcode: string): Promise<void> {
  return api.delete<void>(`/admin/v1/delivery/coverage/postcodes/${postcode}`);
}
export function createCoverageGroup(name: string): Promise<{ id: string }> {
  return api.post<{ id: string }>("/admin/v1/delivery/coverage/groups", { name });
}
export function renameCoverageGroup(id: string, name: string): Promise<void> {
  return api.patch<void>(`/admin/v1/delivery/coverage/groups/${id}`, { name });
}
export function removeCoverageGroup(id: string, confirmNoDrivers: boolean): Promise<{ ungrouped: number }> {
  return api.delete<{ ungrouped: number }>(`/admin/v1/delivery/coverage/groups/${id}${confirmNoDrivers ? "?confirmNoDrivers=true" : ""}`);
}
export function setCourierOffered(offered: boolean): Promise<{ offered: boolean }> {
  return api.put<{ offered: boolean }>("/admin/v1/delivery/coverage/courier", { offered });
}
export function addCourierExclusion(postcode: string, reason: string): Promise<void> {
  return api.post<void>("/admin/v1/delivery/coverage/courier/exclusions", { postcode, reason });
}
export function removeCourierExclusion(postcode: string): Promise<void> {
  return api.delete<void>(`/admin/v1/delivery/coverage/courier/exclusions/${postcode}`);
}
