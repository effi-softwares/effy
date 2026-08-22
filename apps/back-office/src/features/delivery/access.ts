import type { BackOfficeRole } from "@effy/shared-types";

// Interface-layer capability check (least-privilege UX). admin/manager may mutate delivery config;
// csa/role-less see it read-only. The BACKEND independently enforces this from the platform record
// (FR-046) — this only decides which controls the UI reveals.
export function canManageDelivery(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}
