import { useQuery } from "@tanstack/react-query";
import { createRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";

import { ConsoleShell } from "@effy/web-kit/console";

import { NAV } from "@/components/layout/nav";
import { requireSession } from "@/features/auth/guards";
import { sessionQuery, useSignOut } from "@/features/auth/queries";
import { ManagerOnlyScreen } from "@/features/store-identity/ManagerOnlyScreen";
import { ProvingScreen } from "@/features/store-identity/ProvingScreen";
import { setSidebarOpen, toggleTheme, uiStore } from "@/lib/ui-store";

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

  const identity = data?.status === "signed-in" ? data.identity : null;

  return (
    <ConsoleShell
      brand={{ mark: "E", name: "Effy", surface: "Shop" }}
      surfaceLabel="Effy Shop"
      nav={NAV}
      roles={identity?.roles ?? []}
      navGroupLabel="Store"
      email={identity?.email ?? ""}
      theme={theme}
      onToggleTheme={toggleTheme}
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

function DashboardScreen() {
  const { data } = useQuery(sessionQuery);
  const identity = data?.status === "signed-in" ? data.identity : null;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">
          Welcome{identity?.email ? `, ${identity.email}` : ""}
        </h1>
        <p className="text-muted-foreground">You're signed in to the Effy shop console.</p>
      </div>
      <ProvingScreen />
    </div>
  );
}
