/** `@effy/web-kit/console`: the operator consoles' SPA chrome, apart from the runtime so customer-web can skip it. */
export { ConsoleShell, type ConsoleShellProps } from "./ConsoleShell";
export {
  DashboardOverview,
  type DashboardOverviewProps,
  type OverviewStat,
} from "./DashboardOverview";
export { ConsoleBrand, type ConsoleBrandProps } from "./ConsoleBrand";
export { ConsoleHeader, type ConsoleHeaderProps } from "./ConsoleHeader";
export { ConsoleUserMenu, type ConsoleUserMenuProps } from "./ConsoleUserMenu";
export { NavList, type NavListProps } from "./NavList";
export { OtpSignInCard, type OtpSignInCardProps } from "./OtpSignInCard";
export { ErrorState, type ErrorStateProps } from "./ErrorState";
export { DataTable, type DataTableProps } from "./DataTable";
export { currentSection, visibleNav, type NavItem } from "./nav";
export * from "./AlertsButton";
export * from "./MobileNavBar";
export { LiveProvider, useLiveStatus, type LiveProviderProps, type LiveStatusValue } from "../live/LiveProvider";
export { LiveStatus } from "./LiveStatus";
export { PackageStatusPill } from "./PackageStatusPill";
