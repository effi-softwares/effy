import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@effy/design-system/ui";

import type { Theme } from "../runtime/ui-store";
import { displayName, initialsOf } from "./staff-nav";

/**
 * The account and appearance menu, behind the avatar in the header's right corner (2026-10-25: moved
 * out of the sidebar footer — it is used a few times a day, so it takes no rail space). Appearance
 * lives here: Light / Dark / System, as three icons. A surface adds its own entries (back-office: its
 * staff record, keyboard shortcuts) through `items`.
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
  const name = displayName(email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ef-iconbtn group ml-1 rounded-full hover:bg-transparent data-[state=open]:bg-transparent"
          aria-label={`Account and appearance — ${name}`}
        >
          <span
            aria-hidden="true"
            className="ef-account-avatar group-hover:shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--border)] group-data-[state=open]:shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--border)]"
          >
            {initialsOf(name)}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-70" side="bottom" align="end" sideOffset={8}>
        <DropdownMenuLabel className="p-0">
          <div className="flex items-center gap-3 px-2 py-2">
            <span aria-hidden="true" className="ef-account-avatar">
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
        {/* Appearance as three icons in one row — the current one filled. Each stays a menu item (arrow
            keys reach it, Enter picks it) and keeps the menu open, so the change is seen in place. */}
        <div role="group" aria-label="Appearance" className="mx-2 my-1 grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
          {MODES.map(({ value, label, Icon }) => (
            <DropdownMenuItem
              key={value}
              role="menuitemradio"
              aria-checked={theme === value}
              aria-label={`${label} appearance`}
              title={label}
              data-current={theme === value ? "true" : undefined}
              className="min-h-8 justify-center rounded-md p-0 text-muted-foreground data-[current=true]:bg-background data-[current=true]:text-foreground data-[current=true]:shadow-xs [&>svg]:size-4 [&>svg]:text-inherit!"
              onSelect={(event) => {
                event.preventDefault();
                onSetTheme(value);
              }}
            >
              <Icon aria-hidden={true} />
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onSelect={onSignOut}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
