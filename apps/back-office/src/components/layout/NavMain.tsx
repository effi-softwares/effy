import { Link, useLocation } from "@tanstack/react-router";

import type { BackOfficeRole } from "@effy/shared-types";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { visibleNav } from "./nav";

// Block-07's NavMain. Effy's nav is flat (no sub-pages yet), so each item is a leaf link rather
// than a collapsible group. `visibleNav` filters by the same role predicate as the route guard,
// so the Admin item is hidden for manager/csa/role-less accounts (a reflection of the backend gate).
export function NavMain({ roles }: { roles: readonly BackOfficeRole[] }) {
  const { pathname } = useLocation();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {visibleNav(roles).map((item) => {
          const active =
            item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
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
