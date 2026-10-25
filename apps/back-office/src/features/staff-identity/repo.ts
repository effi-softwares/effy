import {
  toBackOfficeRoles,
  type AdminPingResult,
  type BackOfficeAdminPingDTO,
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

export async function loadAdminPing(): Promise<AdminPingResult> {
  const dto = await api.get<BackOfficeAdminPingDTO>("/admin/v1/admin-ping")
  return { subject: dto.subject }
}
