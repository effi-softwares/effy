import { Check, ChevronsUpDown, LogOut, Monitor, Moon, Sun } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@effy/design-system/ui";

import type { Theme } from "../runtime/ui-store";
import { displayName, initialsOf } from "./staff-nav";

/**
 * The sidebar footer: who is signed in, and the account and appearance menu (board "Account and
 * appearance menu"). Appearance lives here, not in the header: Light / Dark / System. A surface adds
 * its own entries (back-office: its staff record, keyboard shortcuts) through `items`.
 */
export interface StaffUserMenuProps {
  email: string;
  /** "Admin", "Manager"… — the highest role held; null for none. */
  roleLabel: string | null;
  /** "Active" / "Disabled", once known. */
  statusLabel?: string | null;
  theme: Theme;
  onSetTheme: (theme: Theme) => void;
  /** Surface-specific menu entries, shown above Appearance. */
  items?: ReactNode;
  onSignOut: () => void;
  signingOut?: boolean;
}

const MODES: readonly { value: Theme; label: string; Icon: ComponentType<{ "aria-hidden"?: boolean }> }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function StaffUserMenu({
  email,
  roleLabel,
  statusLabel,
  theme,
  onSetTheme,
  items,
  onSignOut,
  signingOut = false,
}: StaffUserMenuProps) {
  const { isMobile } = useSidebar();
  const name = displayName(email);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label="Account and appearance"
              className="bo-sb-btn bo-sb-brand data-[state=open]:bg-sidebar-accent"
            >
              <span aria-hidden="true" className="bo-avatar">
                {initialsOf(name)}
              </span>
              <span className="bo-sb-label grid min-w-0 flex-1 leading-tight">
                <strong className="truncate text-sm font-semibold">{name}</strong>
                <span className="truncate text-xs text-muted-foreground">
                  {roleLabel ? `${roleLabel} · ` : ""}
                  {email}
                </span>
              </span>
              <ChevronsUpDown aria-hidden="true" className="bo-sb-chev ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[280px]" side={isMobile ? "top" : "right"} align="end" sideOffset={8}>
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
              {roleLabel || statusLabel ? (
                <div className="flex gap-1 px-2 pb-2">
                  {roleLabel ? <Badge variant="brand">{roleLabel}</Badge> : null}
                  {statusLabel ? <Badge variant="secondary">{statusLabel}</Badge> : null}
                </div>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {items ? (
              <>
                {items}
                <DropdownMenuSeparator />
              </>
            ) : null}
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
