import {
  toBackOfficeRoles,
  type BackOfficeRole,
  type StaffRecord,
  type StaffRecordDTO,
  type TeamChangeDTO,
  type TeamListDTO,
  type TeamMemberDetailDTO,
} from "@effy/shared-types"

import { api } from "@/lib/api"

/** Your own record (`/me`): read only, the record's one role (119 R1). */
export async function loadMe(): Promise<StaffRecord> {
  const dto = await api.get<StaffRecordDTO>("/admin/v1/me")
  return {
    subject: dto.subject,
    name: dto.name,
    email: dto.email,
    roles: toBackOfficeRoles(dto.roles),
    status: dto.status,
  }
}

/** Settings › Team and access (admin only): the admin-team stack on the staff gateway. */
export const fetchTeamPage = (qs: URLSearchParams, signal: AbortSignal) =>
  api.get<TeamListDTO>(`/admin/v1/staff?${qs}`, { signal })
export const checkSignIn = () => api.post<{ checked: boolean }>("/admin/v1/staff/sign-in-check", {})
export const getMember = (id: string) => api.get<TeamMemberDetailDTO>(`/admin/v1/staff/${id}`)

export interface AddPersonInput {
  email: string
  name: string
  role: BackOfficeRole
  invite: boolean
}
export const addPerson = (body: AddPersonInput) => api.post<TeamChangeDTO>("/admin/v1/staff", body)
export const changeRole = (id: string, role: BackOfficeRole, expectedRevision: number) =>
  api.put<TeamChangeDTO>(`/admin/v1/staff/${id}/role`, { role, expectedRevision })
export const setStatus = (id: string, status: "active" | "disabled", expectedRevision: number, role?: BackOfficeRole) =>
  api.post<TeamChangeDTO>(`/admin/v1/staff/${id}/status`, { status, expectedRevision, ...(role ? { role } : {}) })
export const removeMember = (id: string, expectedRevision: number) =>
  api.delete<TeamChangeDTO>(`/admin/v1/staff/${id}?expectedRevision=${expectedRevision}`)
export const signOutEverywhere = (id: string) => api.post<TeamChangeDTO>(`/admin/v1/staff/${id}/sign-out`, {})
export const sendInvitation = (id: string) => api.post<TeamChangeDTO>(`/admin/v1/staff/${id}/invitation`, {})
export const repairMember = (id: string, expectedRevision: number) =>
  api.post<TeamChangeDTO>(`/admin/v1/staff/${id}/repair`, { expectedRevision })
export const renameMember = (id: string, name: string, expectedRevision: number) =>
  api.patch<TeamChangeDTO>(`/admin/v1/staff/${id}`, { name, expectedRevision })
export const renameMe = (name: string) => api.patch<TeamChangeDTO>("/admin/v1/me", { name })
export const deleteSignInAccount = (username: string) =>
  api.delete<{ deleted: boolean }>(`/admin/v1/staff/sign-in-accounts/${encodeURIComponent(username)}`)

/** A member's activity (104 drawer). */
export const memberActivityPath = (id: string) => `/admin/v1/staff/${id}/activity`
