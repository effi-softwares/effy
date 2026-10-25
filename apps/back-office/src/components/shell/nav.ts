import type { LinkProps } from "@tanstack/react-router";
import {
  BadgePercent,
  ClipboardCheck,
  Coins,
  Contact,
  LayoutDashboard,
  ListTree,
  MailWarning,
  MapPinned,
  Package,
  PackageX,
  ReceiptText,
  Warehouse,
  Shield,
  Store,
  Truck,
} from "lucide-react";

import type { BackOfficeRole } from "@effy/shared-types";
import {
  staffActiveKey,
  staffLinkOf,
  staffLocate,
  visibleStaffGroups,
  type StaffNavEntry,
  type StaffNavGroup,
  type StaffNavLeaf,
  type Where,
} from "@effy/web-kit/console";

/**
 * The back-office sidebar (redesign, board "Sidebar — expanded").
 *
 * The old console listed fourteen links in one group and hid Dispatch. The rail now groups them by
 * the job — Operations · People · Catalogue · Settings — with live counts on the ones that need a
 * person. Every page is still the route it was; only where it sits in the menu moved.
 *
 * A hidden item is a courtesy, never the guard. `requiredRole` mirrors the gate the backend checks
 * (Admin and access → admin); the backend refuses the request whatever the menu shows. Every other
 * page is open to every role, csa included — a csa is who answers "where is my order".
 */

/** The live counts the rail carries. Each is read from the page's own query (useNavCounts). */
export type NavCountKey = "dispatch" | "exceptions" | "feedback" | "review" | "deliverability";

/** The model is the consoles' shared one (@effy/web-kit/console), specialised to this surface. */
export type NavLeaf = StaffNavLeaf<BackOfficeRole, NavCountKey>;
export type NavEntry = StaffNavEntry<BackOfficeRole, NavCountKey>;
export type NavGroup = StaffNavGroup<BackOfficeRole, NavCountKey>;

/** The tab a route opens on when the URL names none — a sub-page for it must count as active. */
export const DEFAULT_TAB: Readonly<Record<string, string>> = {
  "/delivery": "coverage",
  "/customers": "customers",
};

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
          // The dispatcher's day lives under Orders; it was a tab nobody could find.
          { key: "dispatch", label: "Dispatch", to: "/orders/assignments", count: "dispatch" },
          // How bags changed hands, and what went wrong.
          { key: "handover-report", label: "Hand-over report", to: "/reports/handovers" },
          { key: "courier", label: "Courier parcels", to: "/orders/handover" },
        ],
      },
      { key: "exceptions", label: "Exceptions", to: "/exceptions", icon: PackageX, count: "exceptions", countTone: "strong" },
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
      { key: "review", label: "Product review", to: "/product-review", icon: ClipboardCheck, count: "review" },
      { key: "schema", label: "Catalogue schema", to: "/catalog", icon: ListTree },
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
    label: "Settings",
    items: [
      {
        key: "delivery-group",
        label: "Delivery",
        to: "/delivery",
        icon: MapPinned,
        // The Delivery settings pages, one per entry (redesign, folder "Delivery settings").
        subs: [
          { key: "coverage", label: "Coverage", to: "/delivery", tab: "coverage" },
          { key: "courier", label: "Courier delivery", to: "/delivery", tab: "courier" },
          { key: "pricing", label: "Pricing", to: "/delivery", tab: "pricing" },
          { key: "windows", label: "Delivery windows", to: "/delivery", tab: "slots" },
          { key: "days", label: "Days and runs", to: "/delivery", tab: "days" },
          { key: "hub", label: "Hub and timings", to: "/delivery", tab: "settings" },
        ],
      },
      { key: "deliverability", label: "Email deliverability", to: "/deliverability", icon: MailWarning, count: "deliverability" },
      { key: "points", label: "Points settings", to: "/customers", tab: "settings", icon: Coins },
      // Effy's tax identity and the tax-invoice switch.
      { key: "tax", label: "Tax", to: "/settings/tax", icon: ReceiptText, requiredRole: "admin" },
      { key: "admin", label: "Admin and access", to: "/admin", icon: Shield, requiredRole: "admin" },
    ],
  },
];

/** The menu this person sees. Role filtering only — the backend is the gate. */
export function visibleGroups(groups: readonly NavGroup[], roles: readonly BackOfficeRole[]): NavGroup[] {
  return visibleStaffGroups(groups, roles);
}

export type { Where };

/** Which leaf is the page on screen (shared matcher, this surface's default tabs). */
export function activeKey(groups: readonly NavGroup[], where: Where): string | null {
  return staffActiveKey(groups, where, DEFAULT_TAB);
}

export function locate(groups: readonly NavGroup[], key: string | null) {
  return staffLocate(groups, key);
}

/** The link for a leaf: its route, plus its tab when it names one. */
export function linkOf(leaf: NavLeaf): LinkProps {
  return staffLinkOf(leaf);
}
