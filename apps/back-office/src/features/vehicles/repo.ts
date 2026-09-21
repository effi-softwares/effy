import type {
  HoldingIssueRequest,
  HoldingReturnRequest,
  VehicleCreateRequest,
  VehicleDetail,
  VehicleListResponse,
  VehicleStatusRequest,
  VehicleUpdateRequest,
} from "@effy/shared-types";

import { api } from "@/lib/api";

import type { VehicleListParams } from "./model";

// The data layer for the back-office vehicle register (061). Screens never touch the api client
// directly (Principle VI). Every endpoint lives on the `fleet` cold-path service behind the shared
// gateway — see specs/061-fleet-foundations/contracts/fleet-vehicles.contract.md.

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function listVehicles(p: VehicleListParams): Promise<VehicleListResponse> {
  return api.get<VehicleListResponse>(
    `/fleet/v1/vehicles${qs({
      status: p.status || undefined,
      refrigeration: p.refrigeration || undefined,
      nonCompliant: p.nonCompliantOnly ? "true" : undefined,
      cursor: p.cursor,
    })}`,
  );
}

export async function getVehicle(vehicleId: string): Promise<VehicleDetail> {
  return api.get<VehicleDetail>(`/fleet/v1/vehicles/${vehicleId}`);
}

export async function createVehicle(body: VehicleCreateRequest): Promise<VehicleDetail> {
  return api.post<VehicleDetail>("/fleet/v1/vehicles", body);
}

/**
 * ⚠ The body is sent EXACTLY as the form built it. A key present with `null` clears the field; a key
 * absent leaves it alone. Do not "clean" this object — dropping nulls here silently restores the
 * defect 056 fixed on drivers, where a zone once assigned could never be un-assigned.
 */
export async function updateVehicle(
  vehicleId: string,
  body: VehicleUpdateRequest,
): Promise<VehicleDetail> {
  return api.patch<VehicleDetail>(`/fleet/v1/vehicles/${vehicleId}`, body);
}

export async function setVehicleStatus(
  vehicleId: string,
  body: VehicleStatusRequest,
): Promise<VehicleDetail> {
  return api.post<VehicleDetail>(`/fleet/v1/vehicles/${vehicleId}/status`, body);
}

export async function issueVehicle(
  vehicleId: string,
  body: HoldingIssueRequest,
): Promise<VehicleDetail> {
  return api.post<VehicleDetail>(`/fleet/v1/vehicles/${vehicleId}/holdings`, body);
}

export async function returnVehicle(
  vehicleId: string,
  body: HoldingReturnRequest,
): Promise<VehicleDetail> {
  return api.post<VehicleDetail>(`/fleet/v1/vehicles/${vehicleId}/holdings/current/return`, body);
}
