import {
  toBackOfficeRoles,
  type AdminPingResult,
  type BackOfficeAdminPingDTO,
  type StaffRecord,
  type StaffRecordDTO,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// US4 graduation: the identity read now hits GET /v1/back-office/me (record-backed) — the backend
// JIT-records the staff member and returns the platform record. Role-less callers are admitted
// (200, roles: []) rather than denied — /me records everyone.
export async function loadMe(): Promise<StaffRecord> {
  const dto = await api.get<StaffRecordDTO>("/v1/back-office/me");
  return {
    subject: dto.subject,
    email: dto.email,
    roles: toBackOfficeRoles(dto.roles),
    status: dto.status,
  };
}

// US3 admin gate: the backend decides from the DB record (status + role). Non-admin/disabled →
// 403 the api-client maps to a forbidden DomainError → the screen shows access-denied.
export async function loadAdminPing(): Promise<AdminPingResult> {
  const dto = await api.get<BackOfficeAdminPingDTO>("/v1/back-office/admin/ping");
  return { subject: dto.subject };
}
