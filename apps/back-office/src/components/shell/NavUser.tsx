import { Check, ChevronsUpDown, IdCard, Keyboard, LogOut, Monitor, Moon, Sun } from "lucide-react";
import type { ComponentType } from "react";

import type { BackOfficeRole, StaffStatus } from "@effy/shared-types";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@effy/design-system/ui";

import type { Theme } from "@/lib/ui-store";

import { displayName, initialsOf, roleLabel } from "./identity";

/**
 * The sidebar footer: who is signed in, and the account and appearance menu (board "Account and
 * appearance menu"). Appearance lives here, not in the header: Light / Dark / System.
 */
export interface NavUserProps {
  email: string;
  roles: readonly BackOfficeRole[];
  /** From the staff record; undefined until it has loaded. */
  status: StaffStatus | undefined;
  theme: Theme;
  onSetTheme: (theme: Theme) => void;
  onOpenRecord: () => void;
  onOpenShortcuts: () => void;
  onSignOut: () => void;
  signingOut?: boolean;
}

const MODES: readonly { value: Theme; label: string; Icon: ComponentType<{ "aria-hidden"?: boolean }> }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function NavUser({
  email,
  roles,
  status,
  theme,
  onSetTheme,
  onOpenRecord,
  onOpenShortcuts,
  onSignOut,
  signingOut = false,
}: NavUserProps) {
  const { isMobile } = useSidebar();
  const name = displayName(email);
  const role = roleLabel(roles);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label="Account and appearance"
              className="bo-sb-btn h-12 p-2 data-[state=open]:bg-sidebar-accent"
            >
              <span aria-hidden="true" className="bo-avatar">
                {initialsOf(name)}
              </span>
              <span className="grid min-w-0 flex-1 leading-tight">
                <strong className="truncate text-sm font-semibold">{name}</strong>
                <span className="truncate text-xs text-sidebar-muted">
                  {role ? `${role} · ` : ""}
                  {email}
                </span>
              </span>
              <ChevronsUpDown aria-hidden="true" className="ml-auto text-sidebar-muted" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[260px]"
            side={isMobile ? "top" : "right"}
            align="end"
            sideOffset={8}
          >
            <DropdownMenuLabel className="p-0 font-normal text-foreground">
              <div className="flex items-center gap-3 px-2 py-2">
                <span aria-hidden="true" className="bo-avatar">
                  {initialsOf(name)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{name}</div>
                  <div className="truncate text-xs text-muted-foreground">{email}</div>
                </div>
              </div>
              <div className="flex gap-1 px-2 pb-2">
                {role ? <Badge variant="brand">{role}</Badge> : null}
                {status ? <Badge variant="secondary">{status === "active" ? "Active" : "Disabled"}</Badge> : null}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOpenRecord}>
              <IdCard aria-hidden="true" />
              Your back-office record
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenShortcuts}>
              <Keyboard aria-hidden="true" />
              Keyboard shortcuts
              <DropdownMenuShortcut>?</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Appearance</DropdownMenuLabel>
            {MODES.map(({ value, label, Icon }) => (
              <DropdownMenuItem
                key={value}
                role="menuitemradio"
                aria-checked={theme === value}
                onSelect={() => onSetTheme(value)}
              >
                <Icon aria-hidden={true} />
                {label}
                {theme === value ? <Check aria-hidden="true" className="ml-auto size-4 text-foreground!" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={signingOut} onSelect={onSignOut}>
              <LogOut aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
