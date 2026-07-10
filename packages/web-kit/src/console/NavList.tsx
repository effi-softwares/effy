import { Link, useLocation } from "@tanstack/react-router";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
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
}

export function NavList<TRole extends string>({
  nav,
  roles,
  groupLabel = "Platform",
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
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
