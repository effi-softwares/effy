import type { BackOfficeRole } from "@effy/shared-types";

// Interface-layer capability check for the Home Composer (least-privilege UX). admin and manager may
// compose and publish; csa (and role-less) see the layout read-only — knowing what the storefront
// currently says is support work, changing the front page of the platform's only public surface is
// not. The BACKEND independently enforces this from the platform record; this only decides which
// controls the UI reveals (mirrors 009/021/027).
export function canComposeHome(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}
