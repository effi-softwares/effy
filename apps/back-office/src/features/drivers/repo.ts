import type {
  AdminDriverCreateRequest,
  AdminDriverListResponse,
  AdminDriverProfile,
  AdminDriverStatusRequest,
  AdminDriverUpdateRequest,
  DutyResponseAdmin,
  FleetReadinessResponse,
} from "@effy/shared-types"

import { api } from "@/lib/api"

import type { ListViews } from "@effy/shared-types"

import type { DriverListParams, DriverListView } from "./model"

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v)
  const s = sp.toString()
  return s ? `?${s}` : ""
}

/** A quick read (a picker): up to 100 drivers in one status. */
export async function listDrivers(p: DriverListParams): Promise<AdminDriverListResponse> {
  return api.get<AdminDriverListResponse>(
    `/fleet/v1/drivers${qs({ q: p.q?.trim() || undefined, view: p.status || undefined, pageSize: "100" })}`,
  )
}

/** One page of the register for the address's view (103). */
export function fetchDriverPage(qs: URLSearchParams, signal: AbortSignal): Promise<AdminDriverListResponse> {
  return api.get<AdminDriverListResponse>(`/fleet/v1/drivers?${qs}`, { signal })
}

export function fetchDriverViews(qs: URLSearchParams, signal: AbortSignal): Promise<ListViews<DriverListView>> {
  return api.get<ListViews<DriverListView>>(`/fleet/v1/drivers?${qs}`, { signal })
}

export async function getDriver(driverId: string): Promise<AdminDriverProfile> {
  return api.get<AdminDriverProfile>(`/fleet/v1/drivers/${driverId}`)
}

export async function createDriver(body: AdminDriverCreateRequest): Promise<AdminDriverProfile> {
  return api.post<AdminDriverProfile>("/fleet/v1/drivers", body)
}

export async function updateDriver(driverId: string, body: AdminDriverUpdateRequest): Promise<AdminDriverProfile> {
  return api.patch<AdminDriverProfile>(`/fleet/v1/drivers/${driverId}`, body)
}

export async function setDriverStatus(driverId: string, body: AdminDriverStatusRequest): Promise<AdminDriverProfile> {
  return api.post<AdminDriverProfile>(`/fleet/v1/drivers/${driverId}/status`, body)
}

export async function getDuty(): Promise<DutyResponseAdmin> {
  return api.get<DutyResponseAdmin>("/fleet/v1/duty")
}

export async function endDutySession(sessionId: string): Promise<unknown> {
  return api.post(`/fleet/v1/duty/${sessionId}/end`)
}

export async function getReadiness(): Promise<FleetReadinessResponse> {
  return api.get<FleetReadinessResponse>("/fleet/v1/readiness")
}

export async function listZones(): Promise<{ id: string; name: string }[]> {
  const res = await api.get<{ items?: { id: string; name: string }[] } | { id: string; name: string }[]>(
    "/admin/v1/delivery/zones",
  )
  if (Array.isArray(res)) return res
  return res.items ?? []
}
