import { Check, ChevronsUpDown, LogOut, Monitor, Moon, Sun } from "lucide-react";
import type { ComponentType } from "react";

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
 * The sidebar footer's identity + account menu: who am I, appearance (Light/Dark/System), sign out.
 *
 * Takes the identity and the callbacks rather than reaching for a session query, so it works for
 * any surface (and renders in a test without a router or a query client).
 */
export interface ConsoleUserMenuProps {
  email: string;
  theme: Theme;
  onSetTheme: (theme: Theme) => void;
  onSignOut: () => void;
  signingOut?: boolean;
}

const APPEARANCE_MODES: readonly { value: Theme; label: string; Icon: ComponentType }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function ConsoleUserMenu({
  email,
  theme,
  onSetTheme,
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
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Appearance
            </DropdownMenuLabel>
            {APPEARANCE_MODES.map(({ value, label, Icon }) => (
              <DropdownMenuItem key={value} onSelect={() => onSetTheme(value)}>
                <Icon />
                {label}
                {theme === value && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
            ))}
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
