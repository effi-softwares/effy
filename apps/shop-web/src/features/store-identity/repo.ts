import {
  toStoreRoles,
  type ManagerPingResult,
  type StoreManagerPingDTO,
  type StoreStaffRecord,
  type StoreStaffRecordDTO,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// The data layer: call the store backend, map the wire DTO to a domain model, and let nothing
// wire-shaped escape past this file (Principle VI).

/** The record-backed identity read. Also the JIT touchpoint that records the operator. */
export async function loadMe(): Promise<StoreStaffRecord> {
  const dto = await api.get<StoreStaffRecordDTO>("/store/v1/me");
  return {
    subject: dto.subject,
    email: dto.email,
    roles: toStoreRoles(dto.roles),
    status: dto.status,
    store: dto.store,
  };
}

/** The manager-only proving read. A 403 here is a correct answer, not a failure to retry. */
export async function loadManagerPing(): Promise<ManagerPingResult> {
  const dto = await api.get<StoreManagerPingDTO>("/store/v1/manager-ping");
  return { subject: dto.subject };
}
