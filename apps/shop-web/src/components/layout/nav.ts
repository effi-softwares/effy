import { BarChart3, Bell, ClipboardList, LayoutDashboard, Package, Palette, Printer, Shield } from "lucide-react";

import type { ShopRole } from "@effy/shared-types";
import { visibleNav, type NavItem, type StaffNavGroup } from "@effy/web-kit/console";

// This surface's nav config. The NavItem model and the `visibleNav` filter are shared; what is in
// the menu, which group it sits in, and which role each item requires, is the console's own.
//
// Order and grouping follow the imported design (sidebar-07): Shop = Today · Orders · Catalog ·
// Insights; Workspace = Management · Notifications · Printing (· Tokens in dev).
//
// The Management item is gated by the same role the backend gate checks. Nav visibility reflects
// the authoritative backend gate — it is never a second source of truth. A shop_staff or
// role-less operator never sees a control it cannot use, and the backend refuses them if they ask
// directly anyway.
export const NAV: NavItem<ShopRole>[] = [
  // "Today" — the screen answers "what needs doing now", and the label should say so.
  { label: "Today", to: "/", icon: LayoutDashboard, group: "Shop" },
  // Orders is deliberately ungated: both shop_manager and shop_staff have full fulfilment
  // access, and the staff standing at the shelves are its primary users. Gating it would hide the
  // work from the people who do it — and the backend admits both roles anyway.
  { label: "Orders", to: "/orders", icon: ClipboardList, group: "Shop" },
  // Catalog is open to any shop member (the backend allows shop_manager OR shop_staff), so no
  // requiredRole — every operator can browse and add products.
  { label: "Catalog", to: "/catalog", icon: Package, group: "Shop" },
  // No Restock item (design revision 2026-09-10): purchasing is deferred to its own future feature.
  // Insights is open to both roles — the money on it is the shop's own, and an operator who can
  // see an order's total on the Orders list is not learning anything new from its weekly sum.
  { label: "Insights", to: "/insights", icon: BarChart3, group: "Shop" },
  { label: "Management", to: "/manager", icon: Shield, requiredRole: "shop_manager", group: "Workspace" },
  // Ungated, like Orders: every operator chooses what interrupts them. The one role-scoped type
  // (`shop_refund_proposed`) is filtered by the platform at enqueue time, never by hiding a switch.
  { label: "Notifications", to: "/settings/notifications", icon: Bell, group: "Workspace" },
  // This computer's label printer. Ungated: every operator prints labels.
  { label: "Printing", to: "/settings/printing", icon: Printer, group: "Workspace" },
  // Dev builds only, stripped the same way router.tsx strips the route: `import.meta.env.DEV`
  // folds to false in a production build. A production item would link to a route that does not
  // exist, and a page of swatches has no place in the operator's nav.
  ...(import.meta.env.DEV
    ? [{ label: "Tokens", to: "/dev/tokens", icon: Palette, group: "Workspace" }]
    : []),
];

/**
 * The menu as the consoles' shared shell takes it: this person's items in their groups. Each item's
 * key and count key is its `to`, so the badges (`useNavBadges`, keyed by `to`) land beside it.
 */
export function navGroups(roles: readonly ShopRole[]): StaffNavGroup<ShopRole>[] {
  const groups: { label: string; items: StaffNavGroup<ShopRole>["items"][number][] }[] = [];
  for (const item of visibleNav(NAV, roles)) {
    const label = item.group ?? "Shop";
    let group = groups.find((g) => g.label === label);
    if (!group) groups.push((group = { label, items: [] }));
    group.items.push({ key: item.to, label: item.label, to: item.to, icon: item.icon, count: item.to });
  }
  return groups;
}
