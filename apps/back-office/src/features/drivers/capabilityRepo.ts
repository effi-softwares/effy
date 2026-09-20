import type {
  CoverageResponse,
  DriverCapabilityListResponse,
  GrantCapabilityRequest,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// The data layer for driver clearances and coverage (062). Screens never touch the api client
// directly (Principle VI).

export async function listCapabilities(driverId: string): Promise<DriverCapabilityListResponse> {
  return api.get<DriverCapabilityListResponse>(`/fleet/v1/drivers/${driverId}/capabilities`);
}

/**
 * ⚠ `zoneId` is sent EXPLICITLY, including as `null` for "every zone". A key absent and a key
 * present-with-null must not be conflated, or "everywhere" becomes indistinguishable from "the
 * operator forgot to choose" — and the platform would grant the broadest possible clearance by
 * accident.
 */
export async function grantCapability(
  driverId: string,
  body: GrantCapabilityRequest,
): Promise<DriverCapabilityListResponse> {
  return api.post<DriverCapabilityListResponse>(`/fleet/v1/drivers/${driverId}/capabilities`, body);
}

export async function revokeCapability(
  driverId: string,
  capabilityId: string,
): Promise<DriverCapabilityListResponse> {
  return api.delete<DriverCapabilityListResponse>(
    `/fleet/v1/drivers/${driverId}/capabilities/${capabilityId}`,
  );
}

export async function getCoverage(): Promise<CoverageResponse> {
  return api.get<CoverageResponse>("/fleet/v1/coverage");
}
