import type {
  DeliveryDaysDTO,
  DeliveryDaysInput,
  DeliverySettingsDTO,
  DeliverySlotDTO,
  DeliverySlotsResponseDTO,
  DeliverySlotInput,
  DeliverySlotPatch,
  NonDeliveryDateDTO,
  NonDeliveryDateInput,
  FeePlanInput,
  FeePlanKind,
  FeePlanDTO,
  FeeSimulationDTO,
  FeeSimulationRequest,
  AddCoveragePostcodesRequest,
  AddCoveragePostcodesResult,
  CoverageCheckResultDTO,
  CoverageListDTO,
  CoveragePlaceSearchDTO,
  PatchCoveragePostcodesRequest,
  CourierReachDTO,
  CourierReachUpdateDTO,
  CourierServiceDTO,
  CourierServiceInput,
  CourierServiceListDTO,
} from "@effy/shared-types"

import { api } from "@/lib/api"

export async function listPlans(kind: FeePlanKind): Promise<FeePlanDTO[]> {
  return (await api.get<{ items: FeePlanDTO[] }>(`/admin/v1/delivery/plans?kind=${kind}`)).items
}
export function createPlan(body: FeePlanInput): Promise<FeePlanDTO> {
  return api.post<FeePlanDTO>("/admin/v1/delivery/plans", body)
}
export function replacePlan(planId: string, body: FeePlanInput): Promise<FeePlanDTO> {
  return api.put<FeePlanDTO>(`/admin/v1/delivery/plans/${planId}`, body)
}
export function activatePlan(planId: string, confirmZeroFloor: boolean): Promise<FeePlanDTO> {
  return api.post<FeePlanDTO>(`/admin/v1/delivery/plans/${planId}/activate`, { confirmZeroFloor })
}
export function simulateFee(body: FeeSimulationRequest): Promise<FeeSimulationDTO> {
  return api.post<FeeSimulationDTO>("/admin/v1/delivery/plans/simulate", body)
}

type SettingsRead = {
  hubLatitude: string | null
  hubLongitude: string | null
  samedayPrepBufferMin: number | null
}
export function getSettings(): Promise<SettingsRead> {
  return api.get<SettingsRead>("/admin/v1/delivery/settings")
}
export function putSettings(body: DeliverySettingsDTO): Promise<DeliverySettingsDTO> {
  return api.put<DeliverySettingsDTO>("/admin/v1/delivery/settings", body)
}

interface CollectionRun {
  id: string
  runTime: string
  label: string | null
  status: string
}
export async function listCollectionRuns(): Promise<CollectionRun[]> {
  return (await api.get<{ items: CollectionRun[] }>("/admin/v1/delivery/collection-runs")).items
}
export async function createCollectionRun(runTime: string, label: string | null): Promise<CollectionRun[]> {
  return (await api.post<{ items: CollectionRun[] }>("/admin/v1/delivery/collection-runs", { runTime, label })).items
}
export async function deleteCollectionRun(id: string): Promise<CollectionRun[]> {
  return (await api.delete<{ items: CollectionRun[] }>(`/admin/v1/delivery/collection-runs/${id}`)).items
}

export async function listSlots(): Promise<DeliverySlotDTO[]> {
  return (await listSlotGrid()).items
}
export function listSlotGrid(): Promise<DeliverySlotsResponseDTO> {
  return api.get<DeliverySlotsResponseDTO>("/fleet/v1/delivery-slots")
}
export function createSlot(body: DeliverySlotInput): Promise<DeliverySlotDTO> {
  return api.post<DeliverySlotDTO>("/fleet/v1/delivery-slots", body)
}
export function patchSlot(slotId: string, body: DeliverySlotPatch): Promise<DeliverySlotDTO> {
  return api.patch<DeliverySlotDTO>(`/fleet/v1/delivery-slots/${slotId}`, body)
}

export function getDeliveryDays(): Promise<DeliveryDaysDTO> {
  return api.get<DeliveryDaysDTO>("/fleet/v1/delivery-days")
}
export function putDeliveryDays(body: DeliveryDaysInput): Promise<DeliveryDaysDTO> {
  return api.put<DeliveryDaysDTO>("/fleet/v1/delivery-days", body)
}
export function addNonDeliveryDate(body: NonDeliveryDateInput): Promise<NonDeliveryDateDTO> {
  return api.post<NonDeliveryDateDTO>("/fleet/v1/delivery-days/dates", body)
}
export function removeNonDeliveryDate(day: string): Promise<void> {
  return api.delete<void>(`/fleet/v1/delivery-days/dates/${day}`)
}

export interface CoverageFilters {
  group?: string
  q?: string
  source?: "computed" | "manual"
  review?: boolean
  today?: "offered" | "not_offered"
  minKm?: string
}

export function listCoverage(f: CoverageFilters = {}, cursor?: string): Promise<CoverageListDTO> {
  const qs = new URLSearchParams()
  if (f.group) qs.set("group", f.group)
  if (f.q) qs.set("q", f.q)
  if (f.source) qs.set("source", f.source)
  if (f.review) qs.set("review", "true")
  if (f.today) qs.set("today", f.today)
  if (f.minKm) qs.set("minKm", f.minKm)
  if (cursor) qs.set("cursor", cursor)
  const tail = qs.toString()
  return api.get<CoverageListDTO>(`/admin/v1/delivery/coverage${tail ? `?${tail}` : ""}`)
}
export function searchCoveragePlaces(q: string): Promise<CoveragePlaceSearchDTO> {
  return api.get<CoveragePlaceSearchDTO>(`/admin/v1/delivery/coverage/places?q=${encodeURIComponent(q)}`)
}
export function checkCoverage(q: string): Promise<CoverageCheckResultDTO> {
  return api.get<CoverageCheckResultDTO>(`/admin/v1/delivery/coverage/check?q=${encodeURIComponent(q)}`)
}
export function addCoveragePostcodes(body: AddCoveragePostcodesRequest): Promise<AddCoveragePostcodesResult> {
  return api.post<AddCoveragePostcodesResult>("/admin/v1/delivery/coverage/postcodes", body)
}
export function patchCoveragePostcodes(body: PatchCoveragePostcodesRequest): Promise<void> {
  return api.patch<void>("/admin/v1/delivery/coverage/postcodes", body)
}
export function removeCoveragePostcode(postcode: string): Promise<void> {
  return api.delete<void>(`/admin/v1/delivery/coverage/postcodes/${postcode}`)
}
export function createCoverageGroup(name: string): Promise<{ id: string }> {
  return api.post<{ id: string }>("/admin/v1/delivery/coverage/groups", { name })
}
export function renameCoverageGroup(id: string, name: string): Promise<void> {
  return api.patch<void>(`/admin/v1/delivery/coverage/groups/${id}`, { name })
}
export function removeCoverageGroup(id: string, confirmNoDrivers: boolean): Promise<{ ungrouped: number }> {
  return api.delete<{ ungrouped: number }>(
    `/admin/v1/delivery/coverage/groups/${id}${confirmNoDrivers ? "?confirmNoDrivers=true" : ""}`,
  )
}
export function updateCourier(
  change: CourierReachUpdateDTO,
): Promise<Pick<CourierReachDTO, "offered" | "whenNoWindows">> {
  return api.put("/admin/v1/delivery/coverage/courier", change)
}
export function addCourierExclusion(postcode: string, reason: string): Promise<void> {
  return api.post<void>("/admin/v1/delivery/coverage/courier/exclusions", { postcode, reason })
}
export function removeCourierExclusion(postcode: string): Promise<void> {
  return api.delete<void>(`/admin/v1/delivery/coverage/courier/exclusions/${postcode}`)
}

export function listCourierServices(): Promise<CourierServiceListDTO> {
  return api.get<CourierServiceListDTO>("/admin/v1/delivery/courier-services")
}
export function createCourierService(body: CourierServiceInput): Promise<CourierServiceDTO> {
  return api.post<CourierServiceDTO>("/admin/v1/delivery/courier-services", body)
}
export function updateCourierService(id: string, body: CourierServiceInput): Promise<CourierServiceDTO> {
  return api.put<CourierServiceDTO>(`/admin/v1/delivery/courier-services/${id}`, body)
}
