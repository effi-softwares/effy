import type {
  StaffActionResponse,
  DispatchDayDTO,
  DispatchWindowsResponse,
  ReassignRoundInput,
  ReorderStopsInput,
} from "@effy/shared-types"

import { api } from "@/lib/api"

export async function getDay(): Promise<DispatchDayDTO> {
  return api.get<DispatchDayDTO>("/fleet/v1/dispatch/day")
}

export async function getWindows(date: string | null): Promise<DispatchWindowsResponse> {
  return api.get<DispatchWindowsResponse>(`/fleet/v1/dispatch/windows${date ? `?date=${date}` : ""}`)
}

export async function getRound(id: string): Promise<unknown> {
  return api.get(`/fleet/v1/dispatch/rounds/${id}`)
}

export async function reassign(id: string, body: ReassignRoundInput): Promise<void> {
  await api.post(`/fleet/v1/dispatch/rounds/${id}/reassign`, body)
}

export async function unassign(id: string, expectedUpdatedAt: string): Promise<void> {
  await api.post(`/fleet/v1/dispatch/rounds/${id}/unassign`, { expectedUpdatedAt })
}

export async function reorder(id: string, body: ReorderStopsInput): Promise<void> {
  await api.post(`/fleet/v1/dispatch/rounds/${id}/reorder`, body)
}

export async function waiveSequence(id: string, reason: string): Promise<StaffActionResponse> {
  return api.post<StaffActionResponse>(`/fleet/v1/dispatch/rounds/${id}/waive-sequence`, { reason })
}
