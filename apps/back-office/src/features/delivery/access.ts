import type { BackOfficeRole } from "@effy/shared-types";

// Interface-layer capability check (least-privilege UX). admin/manager may mutate delivery config;
// csa/role-less see it read-only. The BACKEND independently enforces this from the platform record
// (FR-046) — this only decides which controls the UI reveals.
export function canManageDelivery(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}

/** 083 — the delivery-model switch changes what every customer is sold: an administrator's alone. */
export function canSwitchDeliveryModel(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin");
}
