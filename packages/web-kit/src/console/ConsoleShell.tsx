import type { ReactNode } from "react";

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
import { ConsoleUserMenu } from "./ConsoleUserMenu";
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

  email: string;
  theme: Theme;
  onToggleTheme: () => void;
  onSignOut: () => void;
  signingOut?: boolean;

  /** Controlled sidebar collapse — held in the surface's client store, not a cookie. */
  sidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;

  /** Caps line length on very wide displays; the design system scales the rest. */
  contentClassName?: string;
  children: ReactNode;
}

export function ConsoleShell<TRole extends string>({
  brand,
  surfaceLabel,
  nav,
  roles,
  navGroupLabel,
  email,
  theme,
  onToggleTheme,
  onSignOut,
  signingOut,
  sidebarOpen,
  onSidebarOpenChange,
  contentClassName = "mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 p-4",
  children,
}: ConsoleShellProps<TRole>) {
  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={onSidebarOpenChange}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <ConsoleBrand {...brand} />
        </SidebarHeader>
        <SidebarContent>
          <NavList nav={nav} roles={roles} groupLabel={navGroupLabel} />
        </SidebarContent>
        <SidebarFooter>
          <ConsoleUserMenu
            email={email}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onSignOut={onSignOut}
            signingOut={signingOut}
          />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <ConsoleHeader surfaceLabel={surfaceLabel} nav={nav} />
        <div className={contentClassName}>{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
