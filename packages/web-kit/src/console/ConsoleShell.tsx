import type { CSSProperties, ReactNode } from "react";

import { cn } from "@effy/design-system";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
} from "@effy/design-system/ui";

import type { Theme } from "../runtime/ui-store";
import { ConsoleBrand } from "./ConsoleBrand";
import { ConsoleHeader } from "./ConsoleHeader";
import { AlertsButton } from "./AlertsButton";
import { ConsoleUserMenu } from "./ConsoleUserMenu";
import { MobileNavBar } from "./MobileNavBar";
import { NavList } from "./NavList";
import type { NavItem } from "./nav";

/**
 * The authenticated shell: a collapsible sidebar rail (brand, role-aware nav, identity and sign-out),
 * a top bar, and the main region. Everything variable is a prop, so both consoles share it.
 */
export interface ConsoleShellProps<TRole extends string> {
  brand: { name: string; surface: string };
  /** The static left breadcrumb, e.g. "Effy Shop". */
  surfaceLabel: string;
  nav: readonly NavItem<TRole>[];
  roles: readonly TRole[];
  navGroupLabel?: string;
  /** Optional live counts beside nav items, keyed by `to`. */
  navBadges?: Readonly<Record<string, number | undefined>>;
  /**
   * Optional header controls, placed before the alerts button (which the shell pins). Appearance lives
   * in the sidebar user menu, not the header.
   */
  headerActions?: ReactNode;
  /** Optional alerts affordance; omitted, no bell renders. */
  alerts?: { count: number; onOpen: () => void };
  /** Swaps the breadcrumb header for a title and subtitle. */
  headerTitle?: ReactNode;
  headerSubtitle?: ReactNode;
  /** A breadcrumb trail in place of the title (see `ConsoleHeader`). */
  headerBreadcrumb?: ReactNode;
  /** The sidebar's width, e.g. "14rem" for a 224px rail; omitted, the shadcn default. */
  sidebarWidth?: string;

  email: string;
  theme: Theme;
  onSetTheme: (theme: Theme) => void;
  onSignOut: () => void;
  signingOut?: boolean;

  /** Controlled sidebar collapse — held in the surface's client store, not a cookie. */
  sidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;

  /** Class applied to the main content region; defaults to the shadcn full-width layout. */
  contentClassName?: string;
  children: ReactNode;
}

/** Below this width the console navigates by the bottom bar, and the rail becomes the off-canvas sheet. */
const NARROW_BREAKPOINT = 1100;

export function ConsoleShell<TRole extends string>({
  brand,
  surfaceLabel,
  nav,
  roles,
  navGroupLabel,
  navBadges,
  headerActions,
  alerts,
  headerTitle,
  headerSubtitle,
  headerBreadcrumb,
  sidebarWidth,
  email,
  theme,
  onSetTheme,
  onSignOut,
  signingOut,
  sidebarOpen,
  onSidebarOpenChange,
  contentClassName = "flex w-full flex-1 flex-col gap-4 p-4",
  children,
}: ConsoleShellProps<TRole>) {
  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={onSidebarOpenChange}
      mobileBreakpoint={NARROW_BREAKPOINT}
      style={sidebarWidth ? ({ "--sidebar-width": sidebarWidth } as CSSProperties) : undefined}
    >
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <ConsoleBrand {...brand} />
        </SidebarHeader>
        <SidebarContent>
          <NavList nav={nav} roles={roles} groupLabel={navGroupLabel} badges={navBadges} />
        </SidebarContent>
        <SidebarFooter>
          <ConsoleUserMenu
            email={email}
            theme={theme}
            onSetTheme={onSetTheme}
            onSignOut={onSignOut}
            signingOut={signingOut}
          />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <ConsoleHeader
          surfaceLabel={surfaceLabel}
          nav={nav}
          actions={
            <>
              {headerActions}
              {alerts ? <AlertsButton count={alerts.count} onOpen={alerts.onOpen} /> : null}
            </>
          }
          title={headerTitle}
          subtitle={headerSubtitle}
          breadcrumb={headerBreadcrumb}
        />
        {/* The fixed bottom nav overlays the scroll region, so its height (up to 64px + the safe area)
            and 40px of room are reserved below 1100px, or the last rows and the pagination sit under
            it. At and above 1100px the surface's own bottom padding applies. */}
        <div
          className={cn(
            contentClassName,
            "max-[1099px]:pb-[calc(104px+env(safe-area-inset-bottom))]"
          )}
        >
          {children}
        </div>
        <MobileNavBar nav={nav} roles={roles} />
      </SidebarInset>
    </SidebarProvider>
  );
}
