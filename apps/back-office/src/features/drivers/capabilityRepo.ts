import type { CoverageResponse, DriverCapabilityListResponse, GrantCapabilityRequest } from "@effy/shared-types"

import { api } from "@/lib/api"

export async function listCapabilities(driverId: string): Promise<DriverCapabilityListResponse> {
  return api.get<DriverCapabilityListResponse>(`/fleet/v1/drivers/${driverId}/capabilities`)
}

export async function grantCapability(
  driverId: string,
  body: GrantCapabilityRequest,
): Promise<DriverCapabilityListResponse> {
  return api.post<DriverCapabilityListResponse>(`/fleet/v1/drivers/${driverId}/capabilities`, body)
}

export async function revokeCapability(driverId: string, capabilityId: string): Promise<DriverCapabilityListResponse> {
  return api.delete<DriverCapabilityListResponse>(`/fleet/v1/drivers/${driverId}/capabilities/${capabilityId}`)
}

export async function getCoverage(): Promise<CoverageResponse> {
  return api.get<CoverageResponse>("/fleet/v1/coverage")
}
