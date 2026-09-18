import type { LucideIcon } from "lucide-react";

/**
 * Nav model, generic over a surface's role union.
 *
 * The kit never knows what a role *means* — only that an item may require one. Each console
 * supplies its own `NavItem<ShopRole>[]` / `NavItem<BackOfficeRole>[]`.
 */
export interface NavItem<TRole extends string> {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Hide this item unless the operator holds this role. UX only — the backend gates for real. */
  requiredRole?: TRole;
  /**
   * The sidebar group this item sits under (e.g. "Platform", "Workspace"). Items without one fall
   * into the shell's default group, so a console that never names a group renders one group as before.
   */
  group?: string;
}

/**
 * Split nav into its sidebar groups, in first-appearance order. Items keep their relative order, so
 * the bottom bar (which ignores groups) and the rail agree about sequence.
 */
export function groupNav<TRole extends string>(
  items: readonly NavItem<TRole>[],
  defaultLabel: string,
): { label: string; items: NavItem<TRole>[] }[] {
  const groups: { label: string; items: NavItem<TRole>[] }[] = [];
  for (const item of items) {
    const label = item.group ?? defaultLabel;
    let g = groups.find((x) => x.label === label);
    if (!g) {
      g = { label, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }
  return groups;
}

/**
 * Filter nav by role.
 *
 * This is least-privilege UX and defense in depth, NEVER the guard: the backend independently
 * refuses a request for a hidden route. Hiding a link is not authorization.
 */
export function visibleNav<TRole extends string>(
  nav: readonly NavItem<TRole>[],
  roles: readonly TRole[],
): NavItem<TRole>[] {
  return nav.filter((item) => item.requiredRole === undefined || roles.includes(item.requiredRole));
}

/** Breadcrumb label for the active route, derived from the router (never hand-held). */
export function currentSection<TRole extends string>(
  nav: readonly NavItem<TRole>[],
  pathname: string,
  fallback = "Dashboard",
): string {
  if (pathname === "/") return nav.find((i) => i.to === "/")?.label ?? fallback;
  const match = nav.find((item) => item.to !== "/" && pathname.startsWith(item.to));
  return match?.label ?? fallback;
}
