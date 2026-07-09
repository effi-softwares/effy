import { LayoutDashboard, Shield, type LucideIcon } from "lucide-react";

import type { BackOfficeRole } from "@effy/shared-types";

// Role-aware nav model (Amendment D1 / FR-023 / data-model §8). A small static list; NavMain
// filters it by the session roles. `requiredRole` absent → visible to any signed-in staff.
export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  requiredRole?: BackOfficeRole;
}

export const NAV: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Admin", to: "/admin", icon: Shield, requiredRole: "admin" },
];

// The Admin item is gated by the SAME role predicate the admin route guard uses (plan mechanic
// 2/4) — nav visibility REFLECTS the authoritative backend gate, it is never a second source of
// truth. A manager/csa/role-less account never sees a control it cannot use.
export function visibleNav(roles: readonly BackOfficeRole[]): NavItem[] {
  return NAV.filter(
    (item) => item.requiredRole === undefined || roles.includes(item.requiredRole),
  );
}
