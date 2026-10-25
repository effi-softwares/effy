import type { LucideIcon } from "lucide-react";

/** The nav model, generic over a surface's role union: the kit only knows an item may require a role. */
export interface NavItem<TRole extends string> {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Hide this item unless the operator holds this role. UX only: the backend gates for real. */
  requiredRole?: TRole;
  /** The sidebar group (e.g. "Shop"); the surface maps items into `StaffNavGroup`s by it. */
  group?: string;
}

/** Filters nav by role: least-privilege UX, never the guard (the backend refuses a hidden route regardless). */
export function visibleNav<TRole extends string>(
  nav: readonly NavItem<TRole>[],
  roles: readonly TRole[],
): NavItem<TRole>[] {
  return nav.filter((item) => item.requiredRole === undefined || roles.includes(item.requiredRole));
}
