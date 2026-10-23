import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
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

export interface NavLeaf {
  key: string;
  label: string;
  to: string;
  /** A tab carried in the URL (`/delivery?tab=pricing`). Matched as part of "is this the page". */
  tab?: string;
  count?: NavCountKey;
  requiredRole?: BackOfficeRole;
  /** Shown to any one of these roles (the hub station: admin or manager). */
  requiredAnyRole?: readonly BackOfficeRole[];
}

export interface NavEntry extends NavLeaf {
  icon: LucideIcon;
  /** Exceptions' count is black: it is the one queue where something has already gone wrong. */
  countTone?: "strong";
  subs?: readonly NavLeaf[];
}

export interface NavGroup {
  label: string;
  items: readonly NavEntry[];
}

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
export function visibleGroups(
  groups: readonly NavGroup[],
  roles: readonly BackOfficeRole[],
): NavGroup[] {
  const allowed = (leaf: NavLeaf) =>
    (leaf.requiredRole === undefined || roles.includes(leaf.requiredRole)) &&
    (leaf.requiredAnyRole === undefined || leaf.requiredAnyRole.some((r) => roles.includes(r)));
  return groups
    .map((g) => ({
      label: g.label,
      items: g.items
        .filter(allowed)
        .map((item) => (item.subs ? { ...item, subs: item.subs.filter(allowed) } : item)),
    }))
    .filter((g) => g.items.length > 0);
}

export interface Where {
  pathname: string;
  tab?: string;
}

/**
 * Which leaf is the page on screen. The most specific `to` wins (`/orders/assignments` beats
 * `/orders`), and a leaf that names a tab only matches that tab — so "Pricing" and "Coverage" are
 * never both lit. Derived from the router every render; never held in state.
 */
export function activeKey(groups: readonly NavGroup[], where: Where): string | null {
  const tab = where.tab ?? DEFAULT_TAB[where.pathname];
  let best: { key: string; score: number } | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      for (const leaf of item.subs ?? [item]) {
        const score = matchScore(leaf, where.pathname, tab);
        if (score > 0 && (!best || score > best.score)) best = { key: leaf.key, score };
      }
    }
  }
  return best?.key ?? null;
}

function matchScore(leaf: NavLeaf, pathname: string, tab: string | undefined): number {
  if (leaf.to === "/") return pathname === "/" ? 1 : 0;
  const onPath = pathname === leaf.to || pathname.startsWith(leaf.to + "/");
  if (!onPath) return 0;
  if (leaf.tab !== undefined) {
    // A record under the page (`/customers/abc`) belongs to the page's default tab — the list it was
    // opened from — not to a settings tab that happens to share the route.
    if (pathname !== leaf.to) return leaf.tab === DEFAULT_TAB[leaf.to] ? leaf.to.length * 2 : 0;
    return leaf.tab === tab ? leaf.to.length * 2 + 1 : 0;
  }
  return leaf.to.length * 2;
}

/** Where the active leaf sits: its group, its entry and (for a sub-page) the leaf. For the breadcrumb. */
export function locate(
  groups: readonly NavGroup[],
  key: string | null,
): { group: NavGroup; item: NavEntry; leaf: NavLeaf } | null {
  if (!key) return null;
  for (const group of groups) {
    for (const item of group.items) {
      if (item.key === key) return { group, item, leaf: item };
      const leaf = item.subs?.find((s) => s.key === key);
      if (leaf) return { group, item, leaf };
    }
  }
  return null;
}

/**
 * The link for a leaf: its route, plus its tab when it names one.
 *
 * The nav holds paths as strings (it is data, matched against `location.pathname`), so the router's
 * typed `to` is asserted here, once. nav.test.ts holds every `to` to a route the router declares.
 */
export function linkOf(leaf: NavLeaf): LinkProps {
  return (leaf.tab ? { to: leaf.to, search: { tab: leaf.tab } } : { to: leaf.to }) as LinkProps;
}
