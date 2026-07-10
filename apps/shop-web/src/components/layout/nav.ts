import { LayoutDashboard, Shield } from "lucide-react";

import type { StoreRole } from "@effy/shared-types";
import type { NavItem } from "@effy/web-kit/console";

// This surface's nav config. The NavItem model and the `visibleNav` filter are shared; WHAT is in
// the menu, and which role each item requires, is the console's own.
//
// The Management item is gated by the SAME role the backend gate checks. Nav visibility REFLECTS
// the authoritative backend gate — it is never a second source of truth. A store_staff or
// role-less operator never sees a control it cannot use, and /store/v1/manager-ping refuses them
// if they ask directly anyway.
export const NAV: NavItem<StoreRole>[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Management", to: "/manager", icon: Shield, requiredRole: "store_manager" },
];
