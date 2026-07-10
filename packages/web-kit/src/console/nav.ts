import type { LucideIcon } from "lucide-react";

/**
 * Nav model, generic over a surface's role union.
 *
 * The kit never knows what a role *means* — only that an item may require one. Each console
 * supplies its own `NavItem<StoreRole>[]` / `NavItem<BackOfficeRole>[]`.
 */
export interface NavItem<TRole extends string> {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Hide this item unless the operator holds this role. UX only — the backend gates for real. */
  requiredRole?: TRole;
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
