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
 * The sidebar's primary navigation — flat leaf links, split into the groups each item names.
 *
 * `visibleNav` filters by the same role the backend gate checks, so a privileged item is hidden
 * for an operator who would be refused anyway. The hiding is a courtesy; the refusal is the guard.
 *
 * ⚠ IN THE COLLAPSED ICON RAIL two things the expanded rail says in text would otherwise vanish:
 * - the group labels (the primitive hides them) — so a 1px rule separates the groups instead;
 * - the count (`SidebarMenuBadge` is hidden in icon mode) — so a dot marks the item instead,
 *   `--brand` when it is the active route and `--accent2` (attention) when it is not. A count that
 *   exists only while the rail is expanded is a signal the operator loses by collapsing it.
 */
export interface NavListProps<TRole extends string> {
  nav: readonly NavItem<TRole>[];
  roles: readonly TRole[];
  /** The label for items that name no `group`. */
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

/** Absent, zero and undefined all mean "no badge" — only a positive count is worth a pixel. */
function badgeFor(
  badges: Readonly<Record<string, number | undefined>> | undefined,
  to: string,
): number | null {
  const n = badges?.[to];
  return typeof n === "number" && n > 0 ? n : null;
}
