import { useQuery } from "@tanstack/react-query";
import { createRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";

import { ConsoleShell } from "@effy/web-kit/console";

import { HeaderBreadcrumbs } from "@/components/console/HeaderBreadcrumbs";
import { HeaderChrome } from "@/components/console/HeaderChrome";
import { PwaBanners } from "@/components/console/PwaBanners";
import { useNotificationNavigation } from "@/features/notifications/useNotificationNavigation";
import { NAV } from "@/components/layout/nav";
import { requireSession } from "@/features/auth/guards";
import { sessionQuery, useSignOut } from "@/features/auth/queries";
// ⚠ 058: Today replaced the dashboard. 057 made its counts real; this makes them live, and gives
// the operator the single most urgent thing to act on rather than four figures to interpret.
import { TodayScreen } from "@/features/today/TodayScreen";
import { useNavBadges } from "@/features/today/useNavBadges";
import { ManagerOnlyScreen } from "@/features/shop-identity/ManagerOnlyScreen";
import { meQuery } from "@/features/shop-identity/queries";
import { setSidebarOpen, setTheme, uiStore } from "@/lib/ui-store";

import { rootRoute } from "./__root";

// Protected layout (pathless) — its `beforeLoad` ensures a session or redirects to sign-in
// preserving the intended destination (FR-003/004). Every protected screen nests under it.
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

// Reaching this route is NOT authorization — the backend refuses a non-manager regardless (FR-008).
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
  const { data } = useQuery(sessionQuery);
  const signOut = useSignOut();
  const navigate = useNavigate();
  const navBadges = useNavBadges();
  // 059 FR-014 — a notification tapped while the console is already open routes here instead of
  // opening a second window. The service worker posts the path; the router does the rest.
  useNotificationNavigation();
  // The brand's secondary line is the operator's own shop. Same cache entry the identity screen
  // reads; until it answers (or when no shop is assigned yet) the line names the console instead.
  const { data: me } = useQuery(meQuery);
  const { pathname } = useLocation();

  const identity = data?.status === "signed-in" ? data.identity : null;

  // ⚠ 057 — the imported design puts the screen's identity in the HEADER, not in an <h1> on every
  // page: a breadcrumb trail (design revision 2026-09-10) followed by one line of live context, which
  // reads the same nav badges the rail does rather than a count of its own.
  const subtitle = headerSubtitleFor(pathname, navBadges);

  return (
    <ConsoleShell
      brand={{ mark: "E", name: "Effy Shop", surface: me?.shop?.name ?? "Shop console" }}
      surfaceLabel="Effy Shop"
      sidebarWidth="14rem"
      // ⚠ THE PAGE GUTTER IS `--pad` (24px), NOT THE SHELL'S DEFAULT `p-4` (16px). The design sets
      // one page padding and uses it for the header, the content and the section rhythm alike; at
      // 16px the console's tables sat tighter to the rail than the header above them, which reads as
      // a misalignment rather than as a deliberate density.
      contentClassName="flex w-full flex-1 flex-col gap-[var(--pad)] p-[var(--pad)]"
      headerBreadcrumb={<HeaderBreadcrumbs />}
      headerSubtitle={subtitle}
      headerActions={<HeaderChrome />}
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
      {/* 059 — offline / update-ready / install, one at a time, above the screen they qualify.
          Inside the shell so every protected screen carries them; nothing renders when all three
          are quiet, so an operator who never installs sees no change at all (SC-012). */}
      <PwaBanners />
      <Outlet />
    </ConsoleShell>
  );
}

/**
 * The header's one-line context, per screen (057). The screen's NAME is the breadcrumb's job.
 *
 * ⚠ THE SUBTITLE IS DERIVED FROM THE SAME CACHE THE SIDEBAR BADGES READ. A second count here could
 * disagree with the rail three pixels away, which is the `summarizeFulfillment` mistake 052 deleted —
 * two implementations of one fact, on one screen.
 */
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
