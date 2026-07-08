import {
  toBackOfficeRoles,
  type AdminPingResult,
  type BackOfficeAdminPingDTO,
  type StaffRecord,
  type StaffRecordDTO,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// US4 graduation: the identity read hits GET /admin/v1/me (record-backed; admin cold-path service
// behind the shared gateway — 004 A3) — the backend
// JIT-records the staff member and returns the platform record. Role-less callers are admitted
// (200, roles: []) rather than denied — /me records everyone.
export async function loadMe(): Promise<StaffRecord> {
  const dto = await api.get<StaffRecordDTO>("/admin/v1/me");
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
  const dto = await api.get<BackOfficeAdminPingDTO>("/admin/v1/admin-ping");
  return { subject: dto.subject };
}
