import { Link, useLocation } from "@tanstack/react-router";

import { cn } from "@effy/design-system";

import { visibleNav, type NavItem } from "./nav";

/**
 * The narrow-viewport navigation: the sidebar becomes a bottom bar of the FIRST FIVE destinations
 * below 1100px (theme-adoption-prompt.md, Phase 3 §Console shell).
 *
 * ⚠ FIVE, AND THE REST ARE NOT LOST — they stay reachable through the sidebar sheet the shell's
 * trigger opens. Six or more targets in a 360px bar gives each one under 60px, which is below the
 * 44px hit target once the label is accounted for.
 *
 * ⚠ THE BREAKPOINT IS 1100px, NOT A TAILWIND STEP. The rail is 224px and the console's tables need
 * roughly 880px before columns start colliding; `lg` (1024px) leaves the first screen that matters —
 * the orders table — horizontally scrolling. It is expressed as an arbitrary variant rather than
 * being rounded to `xl` so the number stays the measured one.
 *
 * ⚠ `pb-[env(safe-area-inset-bottom)]` is not decoration: on an iPad in landscape the home indicator
 * sits exactly where this bar's touch targets are.
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
              // 56px + the safe-area padding clears the 44px minimum with room for the label.
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
