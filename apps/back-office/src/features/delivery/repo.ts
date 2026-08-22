// Data layer for back-office delivery configuration (047). Every call goes through the shared api
// client to the admin cold-path service (contracts/delivery-admin-api). Screens never touch `api`
// directly (Principle VI). DTOs double as the domain shapes here (identity map).
import type {
  DeliverySettingsDTO,
  FeePlanDTO,
  PostcodeCheckDTO,
  RingDTO,
  RingSuggestionDTO,
  ZoneDTO,
  ZoneRemovalImpactDTO,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// ── request payloads (match the edge service's parsed bodies) ─────────────────────────────────────

export interface NewRingBody {
  code: string;
  name: string;
  ordinal: number;
  suggestUpperKm: string | null;
}

export interface NewZoneBody {
  code: string;
  name: string;
  ringId: string;
}

export interface ZonePatchBody {
  name?: string;
  ringId?: string;
  samedayEligible?: boolean;
  status?: "active" | "disabled";
}

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
export function createRing(body: NewRingBody): Promise<RingDTO> {
  return api.post<RingDTO>("/admin/v1/delivery/rings", body);
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

// ── zones ─────────────────────────────────────────────────────────────────────────────────────────

export async function listZones(): Promise<ZoneDTO[]> {
  return (await api.get<{ items: ZoneDTO[] }>("/admin/v1/delivery/zones")).items;
}
export function createZone(body: NewZoneBody): Promise<ZoneDTO> {
  return api.post<ZoneDTO>("/admin/v1/delivery/zones", body);
}
export function patchZone(zoneId: string, body: ZonePatchBody): Promise<ZoneDTO> {
  return api.patch<ZoneDTO>(`/admin/v1/delivery/zones/${zoneId}`, body);
}
export function checkPostcode(postcode: string): Promise<PostcodeCheckDTO> {
  return api.get<PostcodeCheckDTO>(`/admin/v1/delivery/postcode-check?postcode=${encodeURIComponent(postcode)}`);
}
export function addPostcode(zoneId: string, postcode: string, confirm: boolean): Promise<PostcodeCheckDTO> {
  return api.post<PostcodeCheckDTO>(`/admin/v1/delivery/zones/${zoneId}/postcodes`, { postcode, confirm });
}
export function removePostcode(zoneId: string, postcode: string): Promise<ZoneRemovalImpactDTO> {
  return api.delete<ZoneRemovalImpactDTO>(`/admin/v1/delivery/zones/${zoneId}/postcodes/${postcode}`);
}
export function suggestRing(zoneId: string): Promise<RingSuggestionDTO> {
  return api.post<RingSuggestionDTO>(`/admin/v1/delivery/zones/${zoneId}/suggest-ring`, {});
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

// ── Collection runs & same-day exceptions (047 US2/US3) ────────────────────────────────────────────

export interface CollectionRun {
  id: string;
  runTime: string;
  label: string | null;
  status: string;
}
export interface SameDayException {
  id: string;
  shopId: string;
  zoneId: string;
  mode: "on" | "off";
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
export async function listExceptions(zoneId: string): Promise<SameDayException[]> {
  return (await api.get<{ items: SameDayException[] }>(`/admin/v1/delivery/zones/${zoneId}/sameday-exceptions`)).items;
}
export async function putException(zoneId: string, shopId: string, mode: "on" | "off"): Promise<SameDayException[]> {
  return (await api.put<{ items: SameDayException[] }>(`/admin/v1/delivery/zones/${zoneId}/sameday-exceptions`, { shopId, mode })).items;
}
export async function deleteException(zoneId: string, shopId: string): Promise<SameDayException[]> {
  return (await api.delete<{ items: SameDayException[] }>(`/admin/v1/delivery/zones/${zoneId}/sameday-exceptions/${shopId}`)).items;
}
