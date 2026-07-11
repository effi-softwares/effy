import type { BackOfficeRole } from "@effy/shared-types";

// Interface-layer capability check for shop management (least-privilege UX). admin and manager may
// mutate; csa (and role-less) see the register read-only. The BACKEND independently enforces this
// from the platform record — this only decides which controls the UI reveals (mirrors auth/model
// isAdmin).
export function canManageShops(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}
