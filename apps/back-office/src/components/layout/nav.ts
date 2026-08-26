import { BadgePercent, LayoutDashboard, MailWarning, MessageSquare, Package, Shield, Store, Tags, Truck } from "lucide-react";

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
  // Orders has NO requiredRole: every back-office role sees it, csa MOST OF ALL. Until 053 nobody at
  // Effy could look up a single order, so a customer told "contact support and we'll sort it out"
  // reached people who could not see what they were being asked about. Only RECORDING a handover or
  // an arrival is admin/manager (gated in-screen, enforced by the backend).
  { label: "Orders", to: "/orders", icon: Package },
  // Catalog has NO requiredRole: every back-office role sees the schema read-only (csa included);
  // admin/manager get the mutating controls (gated in-screen, enforced by the backend).
  { label: "Catalog", to: "/catalog", icon: Tags },
  // included); admin/manager get the mutating controls (gated in-screen, enforced by the backend).
  // Promotions has NO requiredRole: every back-office role sees the code register read-only —
  // answering "is this code still live?" is support work. admin/manager get the mutating controls
  // (gated in-screen, enforced by the backend).
  { label: "Promotions", to: "/promotions", icon: BadgePercent },
  // Delivery has NO requiredRole: every back-office role sees zones/rings/plans read-only (csa
  // included — "do we deliver to X?" is support work). Mutating controls (create/activate/settings)
  // are gated in-screen and enforced by the backend (admin/manager, FR-046).
  { label: "Delivery", to: "/delivery", icon: Truck },
  // Deliverability has NO requiredRole: every back-office role sees it, csa included. A CSA is
  // exactly who is on the phone to the person who cannot sign in, and "we can't reach your address"
  // is the whole answer to that call. Only the REPAIR is admin/manager (gated in-screen, enforced by
  // the backend) — it re-enables mail to an address that hard-failed, and a fresh bounce spends the
  // sending reputation every audience's sign-in depends on.
  { label: "Deliverability", to: "/deliverability", icon: MailWarning },
  // Feedback has NO requiredRole: every back-office role sees it, csa included — feedback is
  // diagnostic and a CSA is exactly who fields the shopper contact it represents. Only the REPLY is
  // admin/manager (gated in-screen, enforced by the backend) — an outward, brand-facing email.
  { label: "Feedback", to: "/feedback", icon: MessageSquare },
  { label: "Admin", to: "/admin", icon: Shield, requiredRole: "admin" },
];
