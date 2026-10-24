import { useQuery } from "@tanstack/react-query";
import { createRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useStore } from "@tanstack/react-store";
import { Search } from "lucide-react";

import { Button } from "@effy/design-system/ui";

import { ConsoleShell, LiveProvider } from "@effy/web-kit/console";

import { HeaderBreadcrumbs } from "@/components/console/HeaderBreadcrumbs";
import { HeaderChrome } from "@/components/console/HeaderChrome";
import { CommandPalette } from "@/components/console/CommandPalette";
import { HeaderLive } from "@/components/console/HeaderLive";
import { NewOrderAlert } from "@/components/console/NewOrderAlert";
import { ScanButton } from "@/components/console/ScanButton";
import { SoundChip } from "@/components/console/SoundChip";
import { PwaBanners } from "@/components/console/PwaBanners";
import { useNotificationNavigation } from "@/features/notifications/useNotificationNavigation";
import { getLiveDescriptor } from "@/features/live/repo";
import { LIVE_ROUTES } from "@/features/live/routes";
import { NAV } from "@/components/layout/nav";
import { requireSession } from "@/features/auth/guards";
import { sessionQuery, useSignOut } from "@/features/auth/queries";
// Today replaced the dashboard. 057 made its counts real; this makes them live, and gives
// the operator the single most urgent thing to act on rather than four figures to interpret.
import { TodayScreen } from "@/features/today/TodayScreen";
import { useNavBadges } from "@/features/today/useNavBadges";
import { ManagerOnlyScreen } from "@/features/shop-identity/ManagerOnlyScreen";
import { meQuery } from "@/features/shop-identity/queries";
import { setScanOpen } from "@/lib/console-store";
import { setCommandPaletteOpen, setSidebarOpen, setTheme, uiStore } from "@/lib/ui-store";

import { rootRoute } from "./__root";

// Protected layout (pathless) — its `beforeLoad` ensures a session or redirects to sign-in
// preserving the intended destination. Every protected screen nests under it.
export const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "protected",
  beforeLoad: async ({ context, location }) => {
    const identity = await requireSession(context.queryClient, location.href);
    return { identity };
  },
  component: AppShell,
});

export const appIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: TodayScreen,
});

// Reaching this route is not authorization — the backend refuses a non-manager regardless.
export const managerRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "manager",
  component: ManagerOnlyScreen,
});

// The dashboard shell is shared (@effy/web-kit/console). What this surface supplies is its brand,
// its nav config, the session it reads roles from, and the client-state bits it owns. Wired by
// hand at the composition root — no DI framework (Principle VI).
function AppShell() {
  const sidebarOpen = useStore(uiStore, (s) => s.sidebarOpen);
  const theme = useStore(uiStore, (s) => s.theme);
  const paletteOpen = useStore(uiStore, (s) => s.commandPaletteOpen);
  // ⌘K / Ctrl+K from anywhere, even from inside a field (Foundations — "Search and commands").
  useHotkey("Mod+K", () => setCommandPaletteOpen(!uiStore.state.commandPaletteOpen), {
    ignoreInputs: false,
    preventDefault: true,
  });
  const { data } = useQuery(sessionQuery);
  const signOut = useSignOut();
  const navigate = useNavigate();
  const navBadges = useNavBadges();
  // A notification tapped while the console is already open routes here instead of
  // opening a second window. The service worker posts the path; the router does the rest.
  useNotificationNavigation();
  // The brand's secondary line is the operator's own shop. Same cache entry the identity screen
  // reads; until it answers (or when no shop is assigned yet) the line names the console instead.
  const { data: me } = useQuery(meQuery);
  const { pathname } = useLocation();

  const identity = data?.status === "signed-in" ? data.identity : null;

  // The imported design puts the screen's identity in the header, not in an <h1> on every
  // page: a breadcrumb trail (design revision 2026-09-10) followed by one line of live context, which
  // reads the same nav badges the rail does rather than a count of its own.
  const subtitle = headerSubtitleFor(pathname, navBadges);

  return (
    // The console is told when its orders, stock or attention list change and re-reads what
    // is on screen. Independent of push notifications: it works with them denied. Open
    // only while signed in; signing out closes the connection.
    <LiveProvider enabled={identity !== null} loadDescriptor={getLiveDescriptor} routes={LIVE_ROUTES}>
      <ConsoleShell
        brand={{ name: "Effy Shop", surface: me?.shop?.name ?? "Shop console" }}
        surfaceLabel="Effy Shop"
        sidebarWidth="14rem"
        // The page gutter is the identity's `--pad` (32 desktop / 24 tablet / 16 phone), with the
        // redesign's 40px of room under the last section.
        contentClassName="flex w-full flex-1 flex-col gap-6 px-[var(--pad)] pt-[var(--pad)] pb-10 max-md:gap-4"
        headerBreadcrumb={<HeaderBreadcrumbs />}
        headerSubtitle={subtitle}
        headerActions={
          <>
            <HeaderChrome />
            <HeaderLive />
            <SoundChip />
            <ScanButton />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Search or jump to…"
              title="Search or jump to… (⌘K)"
              onClick={() => setCommandPaletteOpen(true)}
            >
              <Search aria-hidden="true" />
            </Button>
          </>
        }
        nav={NAV}
        navBadges={navBadges}
        roles={identity?.roles ?? []}
        email={identity?.email ?? ""}
        theme={theme}
        onSetTheme={setTheme}
        onSignOut={() =>
          signOut.mutate(undefined, { onSuccess: () => navigate({ to: "/auth/sign-in" }) })
        }
        signingOut={signOut.isPending}
        sidebarOpen={sidebarOpen}
        onSidebarOpenChange={setSidebarOpen}
      >
        {/* Offline / update-ready / install, one at a time, above the screen they qualify.
            Inside the shell so every protected screen carries them; nothing renders when all three
            are quiet, so an operator who never installs sees no change at all. */}
        <NewOrderAlert />
        <PwaBanners />
        <Outlet />
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setCommandPaletteOpen}
          roles={identity?.roles ?? []}
          onScan={() => setScanOpen(true)}
        />
      </ConsoleShell>
    </LiveProvider>
  );
}

/** The header's one-line context per screen, from the same cache the sidebar badges read so the two agree. */
function headerSubtitleFor(pathname: string, badges: Record<string, number | undefined>): string {
  const waiting = badges["/orders"] ?? 0;

  if (pathname.startsWith("/orders")) {
    return waiting > 0 ? `${waiting} waiting to be picked` : "Nothing waiting";
  }
  if (pathname.startsWith("/catalog")) return "Your shop's products";
  if (pathname.startsWith("/insights")) return "Revenue, volume and product performance";
  if (pathname.startsWith("/manager")) return "Your team and shop settings";
  return waiting > 0 ? `${waiting} to pick` : "Everything is up to date";
}
