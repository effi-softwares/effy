import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import { useStore } from "@tanstack/react-store";

import type { BackOfficeRole } from "@effy/shared-types";
import { SidebarInset, SidebarProvider } from "@effy/design-system/ui";

import { meQuery } from "@/features/staff-identity/queries";
import { config } from "@/lib/env";
import { setCommandPaletteOpen, setSidebarOpen, setTheme, uiStore } from "@/lib/ui-store";

import { AppSidebar } from "./AppSidebar";
import { CHORDS } from "./chords";
import { CommandPalette } from "./CommandPalette";
import { ScanBox } from "./ScanBox";
import { linkOf, locate, NAV_GROUPS, visibleGroups } from "./nav";
import { ShortcutsDialog, StaffRecordDialog } from "./ShellDialogs";
import { HeaderDetailProvider, SiteHeader } from "./SiteHeader";
import { useNavCounts } from "./useNavCounts";

/**
 * The authenticated frame every back-office screen renders inside — shadcn sidebar-07 dressed as the
 * redesign's "Foundations and shell" boards. Wired by hand; no DI.
 *
 * Breakpoints: ≥1024 the full 256px sidebar (folds to the 48px rail with ⌘B, remembered per person);
 * 768–1023 always the rail, whatever was remembered; <768 the sidebar is a sheet behind the header's
 * menu button.
 */
export interface AppShellProps {
  email: string;
  roles: readonly BackOfficeRole[];
  onSignOut: () => void;
  signingOut: boolean;
  children: ReactNode;
}

const TABLET = "(min-width: 768px) and (max-width: 1023px)";

function useMatches(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** "Dev" on the dev stack, "Local" against a local API; nothing in production. */
function environmentLabel(): string | null {
  try {
    const host = new URL(config.apiBaseUrl()).hostname;
    if (host === "localhost" || host === "127.0.0.1") return "Local";
    const env = host.split(".").find((part) => ["dev", "staging", "test"].includes(part));
    return env ? env.charAt(0).toUpperCase() + env.slice(1) : null;
  } catch {
    return null;
  }
}

export function AppShell({ email, roles, onSignOut, signingOut, children }: AppShellProps) {
  const sidebarOpen = useStore(uiStore, (s) => s.sidebarOpen);
  const theme = useStore(uiStore, (s) => s.theme);
  const paletteOpen = useStore(uiStore, (s) => s.commandPaletteOpen);
  const tablet = useMatches(TABLET);
  // In the tablet range the rail is the default; the trigger can still open it for the moment.
  const [tabletOpen, setTabletOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const navigate = useNavigate();

  const groups = useMemo(() => visibleGroups(NAV_GROUPS, roles), [roles]);
  const counts = useNavCounts(email !== "");
  const me = useQuery({ ...meQuery, enabled: email !== "" });
  const environment = useMemo(environmentLabel, []);

  useEffect(() => {
    if (!tablet) setTabletOpen(false);
  }, [tablet]);

  // ⌘K / Ctrl+K anywhere, even from inside a field — it is how people leave one.
  useHotkey("Mod+K", () => setCommandPaletteOpen(!uiStore.state.commandPaletteOpen), { ignoreInputs: false, preventDefault: true });
  // "?" — matched by the character typed (Shift is how most layouts type it).
  useHotkey({ key: "?", shift: true }, () => setShortcutsOpen(true), { ignoreInputs: true });
  for (const chord of CHORDS) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- CHORDS is a module constant; the call order never changes
    useHotkeySequence(chord.keys, () => {
      const where = locate(groups, chord.navKey);
      if (where) void navigate(linkOf(where.leaf) as never);
    }, { ignoreInputs: true });
  }

  return (
    <SidebarProvider
      open={tablet ? tabletOpen : sidebarOpen}
      onOpenChange={tablet ? setTabletOpen : setSidebarOpen}
      mobileBreakpoint={768}
      className="bo-shell"
    >
      <AppSidebar
        groups={groups}
        counts={counts}
        environment={environment}
        onOpenSearch={() => setCommandPaletteOpen(true)}
        user={{
          email,
          roles,
          status: me.data?.status,
          theme,
          onSetTheme: setTheme,
          onOpenRecord: () => setRecordOpen(true),
          onOpenShortcuts: () => setShortcutsOpen(true),
          onSignOut,
          signingOut,
        }}
      />
      <SidebarInset className="min-w-0 bg-background">
        <HeaderDetailProvider>
          <SiteHeader groups={groups} onOpenSearch={() => setCommandPaletteOpen(true)} />
          <main className="bo-content">{children}</main>
        </HeaderDetailProvider>
      </SidebarInset>
      <ScanBox />
      <CommandPalette open={paletteOpen} onOpenChange={setCommandPaletteOpen} groups={groups} roles={roles} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <StaffRecordDialog open={recordOpen} onOpenChange={setRecordOpen} />
    </SidebarProvider>
  );
}
