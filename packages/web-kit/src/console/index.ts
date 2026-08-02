/**
 * `@effy/web-kit/console` — the SPA chrome for an Effy operator console.
 *
 * Split from the runtime entry point so `customer-web` (Next.js SSR) can take the runtime without
 * a sidebar it will never render.
 */
export { ConsoleShell, type ConsoleShellProps } from "./ConsoleShell";
export { ConsoleBrand, type ConsoleBrandProps } from "./ConsoleBrand";
export { ConsoleHeader, type ConsoleHeaderProps } from "./ConsoleHeader";
export { ConsoleUserMenu, type ConsoleUserMenuProps } from "./ConsoleUserMenu";
export { NavList, type NavListProps } from "./NavList";
export { OtpSignInCard, type OtpSignInCardProps } from "./OtpSignInCard";
export { ErrorState, type ErrorStateProps } from "./ErrorState";
export { DataTable, type DataTableProps } from "./DataTable";
// ⚠ 032: promoted from apps/back-office. The SHOP console now makes the same postcode-covers-many-
// suburbs commitment when a shop declares its same-day areas, and a second copy of a CORRECTNESS
// disclosure is the worst kind to duplicate — two places for the same warning to drift or go stale.
export { currentSection, visibleNav, type NavItem } from "./nav";
