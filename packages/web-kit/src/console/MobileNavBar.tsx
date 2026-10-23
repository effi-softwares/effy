import { Link, useLocation } from "@tanstack/react-router";

import { cn } from "@effy/design-system";

import { visibleNav, type NavItem } from "./nav";

/**
 * Below 1100px the sidebar becomes a bottom bar of the first five destinations (the rest stay in the
 * sidebar sheet): six would give each under 60px. 1100px is measured (the 224px rail plus ~880px of
 * table), not a Tailwind step. The safe-area padding keeps targets clear of an iPad's home indicator.
 */
export interface MobileNavBarProps<TRole extends string> {
  nav: readonly NavItem<TRole>[];
  roles: readonly TRole[];
}

export function MobileNavBar<TRole extends string>({ nav, roles }: MobileNavBarProps<TRole>) {
  const { pathname } = useLocation();
  const items = visibleNav(nav, roles).slice(0, 5);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)] max-[1099px]:flex min-[1100px]:hidden"
    >
      {items.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              // 56px plus the safe area clears the 44px minimum with room for the label.
              "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] transition-colors",
              active ? "font-medium text-brand" : "text-muted-foreground"
            )}
          >
            <item.icon className="size-[18px]" />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
