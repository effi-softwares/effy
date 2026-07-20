import { ClipboardList, LayoutDashboard, Package, Shield } from "lucide-react";

import type { ShopRole } from "@effy/shared-types";
import type { NavItem } from "@effy/web-kit/console";

// This surface's nav config. The NavItem model and the `visibleNav` filter are shared; WHAT is in
// the menu, and which role each item requires, is the console's own.
//
// The Management item is gated by the SAME role the backend gate checks. Nav visibility REFLECTS
// the authoritative backend gate — it is never a second source of truth. A shop_staff or
// role-less operator never sees a control it cannot use, and /shop/v1/manager-ping refuses them
// if they ask directly anyway.
export const NAV: NavItem<ShopRole>[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  // Catalog is open to any shop member (the backend allows shop_manager OR shop_staff), so no
  // requiredRole — every operator can browse and add products.
  { label: "Catalog", to: "/catalog", icon: Package },
  // Orders is deliberately UNGATED (FR-019a): both shop_manager and shop_staff have full fulfilment
  // access, and the staff standing at the shelves are its primary users. Gating it would hide the
  // work from the people who do it — and the backend admits both roles anyway.
  { label: "Orders", to: "/orders", icon: ClipboardList },
  { label: "Management", to: "/manager", icon: Shield, requiredRole: "shop_manager" },
];
