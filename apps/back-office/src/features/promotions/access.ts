import type { BackOfficeRole } from "@effy/shared-types";

// Interface-layer capability check for promotions & order rules (least-privilege UX). admin and
// manager may mutate; csa (and role-less) see the register read-only — answering "is this code still
// live?" is support work, changing what it is worth is not. The BACKEND independently enforces this
// from the platform record; this only decides which controls the UI reveals (mirrors 009/021).
export function canManagePromotions(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}
