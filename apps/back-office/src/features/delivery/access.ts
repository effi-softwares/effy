import type { BackOfficeRole } from "@effy/shared-types";

// Interface-layer capability check for delivery management (least-privilege UX). admin and manager
// may mutate; csa (and role-less) see the delivery map read-only. The BACKEND independently enforces
// this from the platform record — this only decides which controls the UI reveals (mirrors the
// shops/catalog slices).
export function canManageDelivery(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}
