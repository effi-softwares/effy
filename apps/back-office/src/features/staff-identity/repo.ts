import {
  toBackOfficeRoles,
  type StaffListDTO,
  type StaffMemberDTO,
  type StaffRecord,
  type StaffRecordDTO,
} from "@effy/shared-types"

import { api } from "@/lib/api"

export async function loadMe(): Promise<StaffRecord> {
  const dto = await api.get<StaffRecordDTO>("/admin/v1/me")
  return {
    subject: dto.subject,
    email: dto.email,
    roles: toBackOfficeRoles(dto.roles),
    status: dto.status,
  }
}

export async function loadTeam(): Promise<StaffMemberDTO[]> {
  return (await api.get<StaffListDTO>("/admin/v1/staff")).items
}
