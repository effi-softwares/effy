import type {
  AdminDriverCreateRequest,
  AdminDriverListResponse,
  AdminDriverProfile,
  AdminDriverStatusRequest,
  AdminDriverUpdateRequest,
  DriverAuditResponse,
  DriverException,
  DriverExceptionKind,
  DriverExceptionListResponse,
  DriverHistoryResponse,
  DriverProofResponse,
  DriverRunDetail,
  DutyResponseAdmin,
  FleetReadinessResponse,
  StrandedReleaseResponse,
  StrandedWorkResponse,
} from "@effy/shared-types";

import { api } from "@/lib/api";

import type { DriverListParams, ExceptionListParams } from "./model";

// The data layer for the back-office driver console (056). Screens never touch the api client
// directly (Principle VI). Every endpoint lives on the `fleet` cold-path service behind the shared
// gateway — see specs/056-driver-management/contracts/fleet-api.contract.md.

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

export async function getHistory(
  driverId: string,
  cursor?: string,
): Promise<DriverHistoryResponse> {
  return api.get<DriverHistoryResponse>(`/fleet/v1/drivers/${driverId}/history${qs({ cursor })}`);
}

export async function getRun(runId: string): Promise<DriverRunDetail> {
  return api.get<DriverRunDetail>(`/fleet/v1/runs/${runId}`);
}

export async function getProof(deliveryTaskId: string): Promise<DriverProofResponse> {
  return api.get<DriverProofResponse>(`/fleet/v1/drops/${deliveryTaskId}/proof`);
}

export async function getDuty(): Promise<DutyResponseAdmin> {
  return api.get<DutyResponseAdmin>("/fleet/v1/duty");
}

export async function endDutySession(sessionId: string): Promise<unknown> {
  return api.post(`/fleet/v1/duty/${sessionId}/end`);
}

export async function getStranded(): Promise<StrandedWorkResponse> {
  return api.get<StrandedWorkResponse>("/fleet/v1/stranded");
}

export async function releaseStranded(body: {
  collectionTaskIds?: string[];
  deliveryTaskIds?: string[];
  note: string;
}): Promise<StrandedReleaseResponse> {
  return api.post<StrandedReleaseResponse>("/fleet/v1/stranded/release", body);
}

export async function listExceptions(p: ExceptionListParams): Promise<DriverExceptionListResponse> {
  return api.get<DriverExceptionListResponse>(
    `/fleet/v1/exceptions${qs({
      kind: p.kind || undefined,
      resolved: p.resolved && p.resolved !== "false" ? p.resolved : undefined,
      driverId: p.driverId || undefined,
      cursor: p.cursor,
    })}`,
  );
}

export async function resolveException(
  kind: DriverExceptionKind,
  exceptionId: string,
  note: string,
): Promise<DriverException> {
  return api.post<DriverException>(`/fleet/v1/exceptions/${kind}/${exceptionId}/resolve`, { note });
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
