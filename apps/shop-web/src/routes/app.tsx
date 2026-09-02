import { useQuery } from "@tanstack/react-query";
import { createRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";

import { ConsoleShell } from "@effy/web-kit/console";

import { NAV } from "@/components/layout/nav";
import { requireSession } from "@/features/auth/guards";
import { sessionQuery, useSignOut } from "@/features/auth/queries";
// ⚠ 057: the dashboard is its own feature slice now. It was an inline component here that rendered
// four em-dashes and a chart of invented data; see DashboardScreen for why both are gone.
import { DashboardScreen } from "@/features/dashboard/DashboardScreen";
import { useNavBadges } from "@/features/dashboard/useNavBadges";
import { ManagerOnlyScreen } from "@/features/shop-identity/ManagerOnlyScreen";
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
  component: DashboardScreen,
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

  const identity = data?.status === "signed-in" ? data.identity : null;

  return (
    <ConsoleShell
      brand={{ mark: "E", name: "Effy", surface: "Shop" }}
      surfaceLabel="Effy Shop"
      nav={NAV}
      navBadges={navBadges}
      roles={identity?.roles ?? []}
      navGroupLabel="Shop"
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
      <Outlet />
    </ConsoleShell>
  );
}
