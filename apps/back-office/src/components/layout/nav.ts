import { LayoutDashboard, Shield, Store } from "lucide-react";

import type { BackOfficeRole } from "@effy/shared-types";
import type { NavItem } from "@effy/web-kit/console";

// This surface's nav config. The NavItem model and the `visibleNav` filter are shared; WHAT is in
// the menu, and which role each item requires, is the console's own.
//
// The Admin item is gated by the SAME role the backend gate checks — nav visibility REFLECTS the
// authoritative backend gate, it is never a second source of truth. A manager/csa/role-less
// account never sees a control it cannot use, and is refused if it asks anyway.
export const NAV: NavItem<BackOfficeRole>[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  // Shops has NO requiredRole: every back-office role sees it. csa gets a read-only register
  // (mutating controls are gated in-screen and enforced by the backend); admin/manager can write.
  { label: "Shops", to: "/shops", icon: Store },
  { label: "Admin", to: "/admin", icon: Shield, requiredRole: "admin" },
];
