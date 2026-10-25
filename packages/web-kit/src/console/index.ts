/** `@effy/web-kit/console`: the operator consoles' SPA chrome, apart from the runtime so customer-web can skip it. */
export { StaffShell, type StaffShellProps } from "./StaffShell";
export { StaffSidebar, type StaffSidebarProps } from "./StaffSidebar";
export { StaffHeader, HeaderDetailProvider, useHeaderBack, useHeaderDetail, type HeaderBack, type StaffHeaderProps } from "./StaffHeader";
export { StaffUserMenu, type StaffUserMenuProps } from "./StaffUserMenu";
export {
  visibleStaffGroups,
  staffActiveKey,
  staffLocate,
  staffLinkOf,
  displayName,
  initialsOf,
  type StaffNavLeaf,
  type StaffNavEntry,
  type StaffNavGroup,
  type DefaultTabs,
  type Where,
} from "./staff-nav";
export { OtpSignInCard, type OtpSignInCardProps } from "./OtpSignInCard";
export { ErrorState, type ErrorStateProps } from "./ErrorState";
export { DataTable, type DataTableProps } from "./DataTable";
export { visibleNav, type NavItem } from "./nav";
export { LiveProvider, useLiveStatus, type LiveProviderProps, type LiveStatusValue } from "../live/LiveProvider";
export { LiveStatus } from "./LiveStatus";
export { PackageStatusPill } from "./PackageStatusPill";
