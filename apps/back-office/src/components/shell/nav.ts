import type { LinkProps } from "@tanstack/react-router"
import {
  BadgePercent,
  Boxes,
  ClipboardCheck,
  Contact,
  LayoutDashboard,
  ListTree,
  MapPinned,
  Package,
  PackageX,
  Settings,
  Warehouse,
  Store,
  Truck,
} from "lucide-react"

import type { BackOfficeRole } from "@effy/shared-types"
import {
  staffActiveKey,
  staffLinkOf,
  staffLocate,
  visibleStaffGroups,
  type StaffNavGroup,
  type StaffNavLeaf,
  type Where,
} from "@effy/web-kit/console"

export type NavCountKey = "dispatch" | "exceptions" | "feedback" | "review" | "deliverability"

type NavLeaf = StaffNavLeaf<BackOfficeRole, NavCountKey>
export type NavGroup = StaffNavGroup<BackOfficeRole, NavCountKey>

export const DEFAULT_TAB: Readonly<Record<string, string>> = {
  "/delivery": "coverage",
  "/customers": "customers",
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Operations",
    items: [
      { key: "overview", label: "Overview", to: "/", icon: LayoutDashboard },
      {
        key: "orders-group",
        label: "Orders",
        to: "/orders",
        icon: Package,
        subs: [
          { key: "orders", label: "All orders", to: "/orders" },
          { key: "dispatch", label: "Dispatch", to: "/orders/assignments", count: "dispatch" },
          // How bags changed hands, and what went wrong.
          { key: "handover-report", label: "Hand-over report", to: "/reports/handovers" },
          { key: "courier", label: "Courier parcels", to: "/orders/handover" },
        ],
      },
      {
        key: "exceptions",
        label: "Exceptions",
        to: "/exceptions",
        icon: PackageX,
        count: "exceptions",
        countTone: "strong",
      },
      // Hub staff check bags in by scanning.
      { key: "hub-station", label: "Hub station", to: "/hub", icon: Warehouse, requiredAnyRole: ["admin", "manager"] },
    ],
  },
  {
    label: "People",
    items: [
      {
        key: "customers-group",
        label: "Customers",
        to: "/customers",
        icon: Contact,
        subs: [
          { key: "customers", label: "Customers", to: "/customers", tab: "customers" },
          { key: "feedback", label: "Feedback", to: "/feedback", count: "feedback" },
        ],
      },
      {
        key: "fleet-group",
        label: "Fleet",
        to: "/drivers",
        icon: Truck,
        subs: [
          { key: "drivers", label: "Drivers", to: "/drivers" },
          { key: "vehicles", label: "Vehicles", to: "/vehicles" },
        ],
      },
      { key: "shops", label: "Shops", to: "/shops", icon: Store },
    ],
  },
  {
    label: "Catalogue",
    items: [
      {
        key: "products-group",
        label: "Products",
        to: "/products",
        icon: Boxes,
        subs: [
          { key: "products", label: "All products", to: "/products" },
          { key: "product-imports", label: "Imports", to: "/products/imports", requiredAnyRole: ["admin", "manager"] },
        ],
      },
      {
        key: "review-group",
        label: "Product review",
        to: "/product-review",
        icon: ClipboardCheck,
        subs: [
          { key: "review", label: "Queue", to: "/product-review", count: "review" },
          { key: "missing-details", label: "Missing details", to: "/product-review/missing-details" },
        ],
      },
      { key: "taxonomy", label: "Categories & attributes", to: "/taxonomy", icon: ListTree },
      {
        key: "promotions-group",
        label: "Promotions",
        to: "/promotions",
        icon: BadgePercent,
        subs: [
          { key: "promotions", label: "Codes", to: "/promotions" },
          { key: "order-rules", label: "Order rules", to: "/promotions/order-rules" },
        ],
      },
    ],
  },
  {
    label: "Setup",
    items: [
      {
        key: "delivery-group",
        label: "Delivery",
        to: "/delivery",
        icon: MapPinned,
        subs: [
          { key: "coverage", label: "Coverage", to: "/delivery", tab: "coverage" },
          { key: "courier", label: "Courier delivery", to: "/delivery", tab: "courier" },
          { key: "pricing", label: "Pricing", to: "/delivery", tab: "pricing" },
          { key: "windows", label: "Delivery windows", to: "/delivery", tab: "slots" },
          { key: "days", label: "Days and runs", to: "/delivery", tab: "days" },
          { key: "hub", label: "Hub and timings", to: "/delivery", tab: "settings" },
        ],
      },
      {
        key: "settings-group",
        label: "Settings",
        to: "/settings",
        icon: Settings,
        subs: [
          { key: "points", label: "Points", to: "/customers", tab: "settings" },
          // Effy's tax identity and the tax-invoice switch.
          { key: "tax", label: "Tax", to: "/settings/tax", requiredRole: "admin" },
          { key: "deliverability", label: "Email deliverability", to: "/deliverability", count: "deliverability" },
          { key: "admin", label: "Admin and access", to: "/admin", requiredRole: "admin" },
        ],
      },
    ],
  },
]

export function visibleGroups(groups: readonly NavGroup[], roles: readonly BackOfficeRole[]): NavGroup[] {
  return visibleStaffGroups(groups, roles)
}

export function activeKey(groups: readonly NavGroup[], where: Where): string | null {
  return staffActiveKey(groups, where, DEFAULT_TAB)
}

export function locate(groups: readonly NavGroup[], key: string | null) {
  return staffLocate(groups, key)
}

export function linkOf(leaf: NavLeaf): LinkProps {
  return staffLinkOf(leaf)
}
