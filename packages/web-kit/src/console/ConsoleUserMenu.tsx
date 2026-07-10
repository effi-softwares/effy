import { ChevronsUpDown, LogOut, Moon, Sun } from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@effy/design-system/ui";

import type { Theme } from "../runtime/ui-store";

/**
 * The sidebar footer's identity + account menu: who am I, light/dark, sign out.
 *
 * Takes the identity and the callbacks rather than reaching for a session query, so it works for
 * any surface (and renders in a test without a router or a query client).
 */
export interface ConsoleUserMenuProps {
  email: string;
  theme: Theme;
  onToggleTheme: () => void;
  onSignOut: () => void;
  signingOut?: boolean;
}

export function ConsoleUserMenu({
  email,
  theme,
  onToggleTheme,
  onSignOut,
  signingOut = false,
}: ConsoleUserMenuProps) {
  const { isMobile } = useSidebar();

  // The session carries only the email; its local part stands in for a display name until the
  // staff record's `name` field is surfaced.
  const name = email ? (email.split("@")[0] ?? email) : "Signed in";
  const initial = (name[0] ?? "?").toUpperCase();

  const identityBlock = (
    <>
      <Avatar className="h-8 w-8 rounded-full">
        <AvatarFallback className="rounded-full">{initial}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-semibold">{name}</span>
        <span className="truncate text-xs">{email}</span>
      </div>
    </>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {identityBlock}
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                {identityBlock}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onToggleTheme()}>
              {theme === "dark" ? <Sun /> : <Moon />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={signingOut} onSelect={() => onSignOut()}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
