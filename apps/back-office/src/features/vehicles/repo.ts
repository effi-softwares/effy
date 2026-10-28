import type {
  HoldingIssueRequest,
  ListViews,
  HoldingReturnRequest,
  VehicleCreateRequest,
  VehicleDetail,
  VehicleListResponse,
  VehicleStatusRequest,
  VehicleUpdateRequest,
} from "@effy/shared-types"

import { api } from "@/lib/api"

import type { VehicleListView } from "./model"

/** One page of the register for the address's view (103). */
export function fetchVehiclePage(qs: URLSearchParams, signal: AbortSignal): Promise<VehicleListResponse> {
  return api.get<VehicleListResponse>(`/fleet/v1/vehicles?${qs}`, { signal })
}

export function fetchVehicleViews(qs: URLSearchParams, signal: AbortSignal): Promise<ListViews<VehicleListView>> {
  return api.get<ListViews<VehicleListView>>(`/fleet/v1/vehicles?${qs}`, { signal })
}

export async function getVehicle(vehicleId: string): Promise<VehicleDetail> {
  return api.get<VehicleDetail>(`/fleet/v1/vehicles/${vehicleId}`)
}

export async function createVehicle(body: VehicleCreateRequest): Promise<VehicleDetail> {
  return api.post<VehicleDetail>("/fleet/v1/vehicles", body)
}

export async function updateVehicle(vehicleId: string, body: VehicleUpdateRequest): Promise<VehicleDetail> {
  return api.patch<VehicleDetail>(`/fleet/v1/vehicles/${vehicleId}`, body)
}

export async function setVehicleStatus(vehicleId: string, body: VehicleStatusRequest): Promise<VehicleDetail> {
  return api.post<VehicleDetail>(`/fleet/v1/vehicles/${vehicleId}/status`, body)
}

export async function issueVehicle(vehicleId: string, body: HoldingIssueRequest): Promise<VehicleDetail> {
  return api.post<VehicleDetail>(`/fleet/v1/vehicles/${vehicleId}/holdings`, body)
}

export async function returnVehicle(vehicleId: string, body: HoldingReturnRequest): Promise<VehicleDetail> {
  return api.post<VehicleDetail>(`/fleet/v1/vehicles/${vehicleId}/holdings/current/return`, body)
}
