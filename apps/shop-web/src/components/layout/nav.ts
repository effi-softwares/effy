import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Package,
  Palette,
  Settings,
  Shield,
} from "lucide-react";

import type { ShopRole } from "@effy/shared-types";
import { visibleStaffGroups, type NavItem, type StaffNavGroup } from "@effy/web-kit/console";

// This surface's menu, in the consoles' shared model (the same shape back-office's is): groups of
// entries, an entry may hold sub-pages, a leaf may carry a count. The tree below is the ONE source; the
// flat `NAV` (⌘K's "Go to", the reachability tests) is derived from it.
//
// Shop = Today · Orders (All orders · Awaiting pick · Queue) · Catalog (Products · Availability) ·
// Insights; Workspace = Management · Settings (Notifications · Printing) (· Tokens in dev).
//
// A hidden item is a courtesy, never the gate: Management carries the role the backend checks, and
// the backend refuses a shop_staff or role-less operator who asks directly anyway.
//
// Counts are keyed by route (`useNavBadges`): "/orders" is the awaiting-pick count.
const NAV_GROUPS: readonly StaffNavGroup<ShopRole>[] = [
  {
    label: "Shop",
    items: [
      // "Today" — the screen answers "what needs doing now", and the label should say so.
      { key: "today", label: "Today", to: "/", icon: LayoutDashboard },
      // Orders is deliberately ungated: both shop_manager and shop_staff have full fulfilment
      // access, and the staff standing at the shelves are its primary users.
      {
        key: "orders-group",
        label: "Orders",
        to: "/orders",
        icon: ClipboardList,
        subs: [
          { key: "orders", label: "All orders", to: "/orders" },
          { key: "orders-new", label: "Awaiting pick", to: "/orders", query: { tab: "new" }, count: "/orders" },
          // The packing bench: the same list as four lanes.
          { key: "orders-queue", label: "Queue", to: "/orders", query: { view: "queue" } },
        ],
      },
      // Open to any shop member (the backend allows shop_manager OR shop_staff).
      {
        key: "catalog-group",
        label: "Catalog",
        to: "/catalog",
        icon: Package,
        subs: [
          { key: "catalog", label: "Products", to: "/catalog" },
          { key: "availability", label: "Availability", to: "/catalog/availability" },
        ],
      },
      // No Restock item (design revision 2026-09-10): purchasing is deferred to its own future feature.
      // Insights is open to both roles — the money on it is the shop's own.
      { key: "insights", label: "Insights", to: "/insights", icon: BarChart3 },
    ],
  },
  {
    label: "Workspace",
    items: [
      { key: "manager", label: "Management", to: "/manager", icon: Shield, requiredRole: "shop_manager" },
      {
        key: "settings-group",
        label: "Settings",
        to: "/settings",
        icon: Settings,
        subs: [
          // Ungated: every operator chooses what interrupts them. The one role-scoped type
          // (`shop_refund_proposed`) is filtered by the platform at enqueue time, never by hiding a switch.
          { key: "notifications", label: "Notifications", to: "/settings/notifications" },
          // This computer's label printer. Ungated: every operator prints labels.
          { key: "printing", label: "Printing", to: "/settings/printing" },
        ],
      },
      // Dev builds only, stripped the same way router.tsx strips the route: `import.meta.env.DEV`
      // folds to false in a production build, so production has no link to a route it lacks.
      ...(import.meta.env.DEV ? [{ key: "tokens", label: "Tokens", to: "/dev/tokens", icon: Palette }] : []),
    ],
  },
];

/** The menu this person sees, for the shared shell. Role filtering only — the backend is the gate. */
export function navGroups(roles: readonly ShopRole[]): StaffNavGroup<ShopRole>[] {
  return visibleStaffGroups(NAV_GROUPS, roles);
}

/**
 * Every destination as a flat list — each page once, a sub-page under its entry's icon and group,
 * carrying the search params that make it (Queue is `/orders?view=queue`).
 */
export const NAV: NavItem<ShopRole>[] = NAV_GROUPS.flatMap((group) =>
  group.items.flatMap((entry) =>
    (entry.subs ?? [entry]).map((leaf) => ({
      label: leaf.label,
      to: leaf.to,
      icon: entry.icon,
      group: group.label,
      requiredRole: leaf.requiredRole ?? entry.requiredRole,
      ...(leaf.query ? { search: leaf.query } : {}),
    })),
  ),
);
