import type { BackOfficeRole } from "@effy/shared-types";

// Interface-layer capability check for catalog schema management (least-privilege UX). admin and
// manager may mutate; csa (and role-less) see the schema read-only. The BACKEND independently
// enforces this from the platform record — this only decides which controls the UI reveals
// (mirrors features/shops/access.ts).
export function canManageCatalog(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}
