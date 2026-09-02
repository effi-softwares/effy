import { Link, useLocation } from "@tanstack/react-router";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@effy/design-system/ui";

import { visibleNav, type NavItem } from "./nav";

/**
 * The sidebar's primary navigation — flat leaf links (no sub-pages yet, so no collapsible groups).
 *
 * `visibleNav` filters by the same role the backend gate checks, so a privileged item is hidden
 * for an operator who would be refused anyway. The hiding is a courtesy; the refusal is the guard.
 */
export interface NavListProps<TRole extends string> {
  nav: readonly NavItem<TRole>[];
  roles: readonly TRole[];
  groupLabel?: string;
  /**
   * ⚠ 057 — OPTIONAL, AND ABSENT MEANS NO BADGE AT ALL. Keyed by the item's `to`. shop-web shows a
   * live count of orders waiting; back-office passes nothing and renders byte-identically, which is
   * how this shared component gains a capability without changing the other console (Principle II).
   *
   * ⚠ A zero is NOT rendered. "0 orders waiting" is noise on a rail read at a glance, and a badge
   * that is always present stops being a signal.
   */
  badges?: Readonly<Record<string, number | undefined>>;
}

export function NavList<TRole extends string>({
  nav,
  roles,
  groupLabel = "Platform",
  badges,
}: NavListProps<TRole>) {
  const { pathname } = useLocation();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {visibleNav(nav, roles).map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                <Link to={item.to}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
              {badgeFor(badges, item.to) ? (
                <SidebarMenuBadge className="tabular-nums">
                  {badgeFor(badges, item.to)}
                </SidebarMenuBadge>
              ) : null}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

/** Absent, zero and undefined all mean "no badge" — only a positive count is worth a pixel. */
function badgeFor(
  badges: Readonly<Record<string, number | undefined>> | undefined,
  to: string,
): number | null {
  const n = badges?.[to];
  return typeof n === "number" && n > 0 ? n : null;
}
