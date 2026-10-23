import { Link, useLocation } from "@tanstack/react-router";

import { cn } from "@effy/design-system";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@effy/design-system/ui";

import { groupNav, visibleNav, type NavItem } from "./nav";

/**
 * The sidebar's navigation: flat links in the groups each item names. `visibleNav` hides what the
 * backend would refuse (a courtesy; the refusal is the guard). In the collapsed rail a 1px rule
 * replaces the group labels and a dot replaces the count (`--brand` when active, `--accent2` otherwise).
 */
export interface NavListProps<TRole extends string> {
  nav: readonly NavItem<TRole>[];
  roles: readonly TRole[];
  /** The label for items that name no `group`. */
  groupLabel?: string;
  /** Optional counts keyed by the item's `to`; zero renders no badge. */
  badges?: Readonly<Record<string, number | undefined>>;
}

export function NavList<TRole extends string>({
  nav,
  roles,
  groupLabel = "Platform",
  badges,
}: NavListProps<TRole>) {
  const { pathname } = useLocation();
  const groups = groupNav(visibleNav(nav, roles), groupLabel);

  return (
    <>
      {groups.map((group, index) => (
        <SidebarGroup key={group.label}>
          {index > 0 ? (
            <div
              aria-hidden="true"
              className="bg-sidebar-border mx-1 mb-2 hidden h-px group-data-[collapsible=icon]:block"
            />
          ) : null}
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarMenu className="gap-1">
            {group.items.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              const count = badgeFor(badges, item.to);
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                    <Link to={item.to} className="relative">
                      <item.icon />
                      {count ? (
                        <span
                          aria-hidden="true"
                          data-slot="nav-dot"
                          className={cn(
                            "absolute top-1 right-1 hidden size-[7px] rounded-full group-data-[collapsible=icon]:block",
                            active ? "bg-brand" : "bg-accent2",
                          )}
                        />
                      ) : null}
                      {/* Last child on purpose: the primitive truncates `span:last-child`. */}
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {count ? <SidebarMenuBadge className="tabular-nums">{count}</SidebarMenuBadge> : null}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}

/** Only a positive count renders a badge. */
function badgeFor(
  badges: Readonly<Record<string, number | undefined>> | undefined,
  to: string,
): number | null {
  const n = badges?.[to];
  return typeof n === "number" && n > 0 ? n : null;
}
