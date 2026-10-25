import { BarChart3, ClipboardList, LayoutDashboard, Package, Settings, Shield } from "lucide-react"

import type { ShopRole } from "@effy/shared-types"
import { visibleStaffGroups, type NavItem, type StaffNavGroup } from "@effy/web-kit/console"

const NAV_GROUPS: readonly StaffNavGroup<ShopRole>[] = [
  {
    label: "Shop",
    items: [
      { key: "today", label: "Today", to: "/", icon: LayoutDashboard },
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
          { key: "notifications", label: "Notifications", to: "/settings/notifications" },
          // This computer's label printer. Ungated: every operator prints labels.
          { key: "printing", label: "Printing", to: "/settings/printing" },
        ],
      },
    ],
  },
]

export function navGroups(roles: readonly ShopRole[]): StaffNavGroup<ShopRole>[] {
  return visibleStaffGroups(NAV_GROUPS, roles)
}

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
)
