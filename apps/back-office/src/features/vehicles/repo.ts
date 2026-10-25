import type {
  HoldingIssueRequest,
  HoldingReturnRequest,
  VehicleCreateRequest,
  VehicleDetail,
  VehicleListResponse,
  VehicleStatusRequest,
  VehicleUpdateRequest,
} from "@effy/shared-types"

import { api } from "@/lib/api"

import type { VehicleListParams } from "./model"

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v)
  const s = sp.toString()
  return s ? `?${s}` : ""
}

export async function listVehicles(p: VehicleListParams): Promise<VehicleListResponse> {
  return api.get<VehicleListResponse>(
    `/fleet/v1/vehicles${qs({
      status: p.status || undefined,
      refrigeration: p.refrigeration || undefined,
      nonCompliant: p.nonCompliantOnly ? "true" : undefined,
      cursor: p.cursor,
    })}`,
  )
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
