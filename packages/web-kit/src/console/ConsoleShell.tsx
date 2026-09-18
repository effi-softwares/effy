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
 * The authenticated shell every protected screen renders inside: a collapsible sidebar rail
 * (brand · role-aware nav · identity + sign-out), a top bar showing the current location, and a
 * main content region.
 *
 * Everything variable is a prop — brand, nav, roles, identity, callbacks — so both consoles use
 * one shell rather than two near-identical copies. No DI framework: the app wires it by hand.
 */
export interface ConsoleShellProps<TRole extends string> {
  brand: { mark: string; name: string; surface: string };
  /** The static left breadcrumb, e.g. "Effy Shop". */
  surfaceLabel: string;
  nav: readonly NavItem<TRole>[];
  roles: readonly TRole[];
  navGroupLabel?: string;
  /** 057 — optional live counts beside nav items, keyed by `to`. Omitted = no badges (back-office). */
  navBadges?: Readonly<Record<string, number | undefined>>;
  /**
   * 057 — optional controls on the right of the header bar.
   *
   * ⚠ THESE SIT BEFORE THE ALERTS BUTTON, WHICH THE SHELL SUPPLIES. The design pins it to the same
   * place on every screen, so a screen cannot take its slot — record pagination and other per-screen
   * controls go here, to its left. There is no header theme toggle: appearance lives in the sidebar
   * user menu (Light / Dark / Follow-System).
   */
  headerActions?: ReactNode;
  /**
   * Optional alerts affordance. Omitted, no bell renders at all — a console with nothing to alert
   * about should not carry a permanently silent indicator.
   */
  alerts?: { count: number; onOpen: () => void };
  /** 057 — supplying a title swaps the breadcrumb header for the imported design's title+subtitle. */
  headerTitle?: ReactNode;
  headerSubtitle?: ReactNode;
  /** 057 — a breadcrumb trail in place of the title (see `ConsoleHeader`). Omitted = unchanged. */
  headerBreadcrumb?: ReactNode;
  /**
   * 057 — the sidebar's width, e.g. "14rem" for the imported design's 224px rail. Omitted keeps the
   * shadcn default, which is what back-office renders at today.
   */
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
        {/* ⚠ The bottom nav is FIXED, so it overlays the end of the scroll region. The padding below
            reserves its height (56px + the device safe area) and is removed at the same 1100px
            breakpoint the bar disappears at — without it the last table row and the pagination
            controls sit permanently under the bar and cannot be reached. */}
        <div
          className={cn(
            contentClassName,
            "pb-[calc(56px+env(safe-area-inset-bottom))] min-[1100px]:pb-0"
          )}
        >
          {children}
        </div>
        <MobileNavBar nav={nav} roles={roles} />
      </SidebarInset>
    </SidebarProvider>
  );
}
