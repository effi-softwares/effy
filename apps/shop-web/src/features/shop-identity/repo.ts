import {
  toShopRoles,
  type ManagerPingResult,
  type ShopManagerPingDTO,
  type ShopStaffRecord,
  type ShopStaffRecordDTO,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// The data layer: call the shop backend, map the wire DTO to a domain model, and let nothing
// wire-shaped escape past this file (Principle VI).

/** The record-backed identity read. Also the JIT touchpoint that records the operator. */
export async function loadMe(): Promise<ShopStaffRecord> {
  const dto = await api.get<ShopStaffRecordDTO>("/shop/v1/me");
  return {
    subject: dto.subject,
    email: dto.email,
    roles: toShopRoles(dto.roles),
    status: dto.status,
    shop: dto.shop,
  };
}

/** The manager-only proving read. A 403 here is a correct answer, not a failure to retry. */
export async function loadManagerPing(): Promise<ManagerPingResult> {
  const dto = await api.get<ShopManagerPingDTO>("/shop/v1/manager-ping");
  return { subject: dto.subject };
}
