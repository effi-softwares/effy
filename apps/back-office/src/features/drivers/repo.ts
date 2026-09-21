import type {
  AdminDriverCreateRequest,
  AdminDriverListResponse,
  AdminDriverProfile,
  AdminDriverStatusRequest,
  AdminDriverUpdateRequest,
  DriverAuditResponse,
  DutyResponseAdmin,
  FleetReadinessResponse,
} from "@effy/shared-types";

import { api } from "@/lib/api";

import type { DriverListParams } from "./model";

// The data layer for the back-office driver console (056). Screens never touch the api client
// directly (Principle VI). Every endpoint lives on the `fleet` cold-path service behind the shared
// gateway — see specs/056-driver-management/contracts/fleet-api.contract.md.
//
// ⚠ WORK HISTORY, PROOF, STRANDED WORK AND EXCEPTIONS LEFT THIS LAYER with the routes they called.
// They projected the 049 work model, dropped whole by
// db/migrations/20260920101500_remove_driver_work_model.sql. What is left is the EMPLOYMENT console —
// the register, a profile, status transitions, the change log, duty and readiness — which never
// depended on the shape of a run.

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function listDrivers(p: DriverListParams): Promise<AdminDriverListResponse> {
  return api.get<AdminDriverListResponse>(
    `/fleet/v1/drivers${qs({
      q: p.q?.trim() || undefined,
      status: p.status || undefined,
      zoneId: p.zoneId || undefined,
      includeOffboarded: p.includeOffboarded ? "true" : undefined,
      cursor: p.cursor,
    })}`,
  );
}

export async function getDriver(driverId: string): Promise<AdminDriverProfile> {
  return api.get<AdminDriverProfile>(`/fleet/v1/drivers/${driverId}`);
}

export async function createDriver(body: AdminDriverCreateRequest): Promise<AdminDriverProfile> {
  return api.post<AdminDriverProfile>("/fleet/v1/drivers", body);
}

/**
 * ⚠ The body is sent EXACTLY as the form built it. A key present with `null` clears the field; a key
 * absent leaves it alone (FR-010). Do not "clean" this object — dropping nulls here would silently
 * restore the defect the whole requirement exists to fix.
 */
export async function updateDriver(
  driverId: string,
  body: AdminDriverUpdateRequest,
): Promise<AdminDriverProfile> {
  return api.patch<AdminDriverProfile>(`/fleet/v1/drivers/${driverId}`, body);
}

export async function setDriverStatus(
  driverId: string,
  body: AdminDriverStatusRequest,
): Promise<AdminDriverProfile> {
  return api.post<AdminDriverProfile>(`/fleet/v1/drivers/${driverId}/status`, body);
}

export async function getDriverAudit(driverId: string): Promise<DriverAuditResponse> {
  return api.get<DriverAuditResponse>(`/fleet/v1/drivers/${driverId}/audit`);
}

export async function getDuty(): Promise<DutyResponseAdmin> {
  return api.get<DutyResponseAdmin>("/fleet/v1/duty");
}

export async function endDutySession(sessionId: string): Promise<unknown> {
  return api.post(`/fleet/v1/duty/${sessionId}/end`);
}

export async function getReadiness(): Promise<FleetReadinessResponse> {
  return api.get<FleetReadinessResponse>("/fleet/v1/readiness");
}

/** ⚠ The zone picker reuses the EXISTING delivery route (047). This feature creates no zone
 *  endpoint of its own — zones are the delivery engine's, not the fleet service's. */
export async function listZones(): Promise<{ id: string; name: string }[]> {
  const res = await api.get<{ items?: { id: string; name: string }[] } | { id: string; name: string }[]>(
    "/admin/v1/delivery/zones",
  );
  if (Array.isArray(res)) return res;
  return res.items ?? [];
}
