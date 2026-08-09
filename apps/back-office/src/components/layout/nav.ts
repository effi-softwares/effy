import { BadgePercent, Home, LayoutDashboard, MailWarning, Shield, Store, Tags } from "lucide-react";

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
  // Home page (042) has NO requiredRole: every back-office role sees the layout read-only — a CSA
  // asked "why does the site say X" needs to be able to look. admin/manager get the composing and
  // publishing controls (gated in-screen, enforced by the backend). ⚠ It is the front page of the
  // platform's only PUBLIC surface, which is why the mutate gate here is the same one promotions and
  // shops use rather than anything looser.
  { label: "Home page", to: "/home-page", icon: Home },
  // Catalog has NO requiredRole: every back-office role sees the schema read-only (csa included);
  // admin/manager get the mutating controls (gated in-screen, enforced by the backend).
  { label: "Catalog", to: "/catalog", icon: Tags },
  // included); admin/manager get the mutating controls (gated in-screen, enforced by the backend).
  // Promotions has NO requiredRole: every back-office role sees the code register read-only —
  // answering "is this code still live?" is support work. admin/manager get the mutating controls
  // (gated in-screen, enforced by the backend).
  { label: "Promotions", to: "/promotions", icon: BadgePercent },
  // Deliverability has NO requiredRole: every back-office role sees it, csa included. A CSA is
  // exactly who is on the phone to the person who cannot sign in, and "we can't reach your address"
  // is the whole answer to that call. Only the REPAIR is admin/manager (gated in-screen, enforced by
  // the backend) — it re-enables mail to an address that hard-failed, and a fresh bounce spends the
  // sending reputation every audience's sign-in depends on.
  { label: "Deliverability", to: "/deliverability", icon: MailWarning },
  { label: "Admin", to: "/admin", icon: Shield, requiredRole: "admin" },
];
