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
export { currentSection, visibleNav, type NavItem } from "./nav";
