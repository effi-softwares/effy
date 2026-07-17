import { useQuery } from "@tanstack/react-query";
import { createRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";

import { ConsoleShell } from "@effy/web-kit/console";

import { NAV } from "@/components/layout/nav";
import { requireSession } from "@/features/auth/guards";
import { sessionQuery, useSignOut } from "@/features/auth/queries";
import { AdminOnlyScreen } from "@/features/staff-identity/AdminOnlyScreen";
import { ProvingScreen } from "@/features/staff-identity/ProvingScreen";
import { setSidebarOpen, setTheme, uiStore } from "@/lib/ui-store";

import { rootRoute } from "./__root";

// Protected layout (pathless) — its `beforeLoad` ensures a session or redirects to sign-in
// (FR-003/004; plan mechanic 1). All protected routes (US2/US3 proving screens) nest under it.
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

export const adminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "admin",
  component: AdminOnlyScreen,
});

// The default dashboard shell (FR-023 / Amendment D1, shadcn sidebar-07). The shell itself is
// shared (@effy/web-kit/console); what this surface supplies is its brand, its nav config, the
// session it reads roles from, and the client-state bits it owns. Wired by hand — no DI framework.
function AppShell() {
  const sidebarOpen = useStore(uiStore, (s) => s.sidebarOpen);
  const theme = useStore(uiStore, (s) => s.theme);
  const { data } = useQuery(sessionQuery);
  const signOut = useSignOut();
  const navigate = useNavigate();

  const identity = data?.status === "signed-in" ? data.identity : null;

  return (
    <ConsoleShell
      brand={{ mark: "E", name: "Effy", surface: "Back-Office" }}
      surfaceLabel="Effy Back-Office"
      nav={NAV}
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
        <p className="text-muted-foreground">
          You're signed in to the Effy back-office console.
        </p>
      </div>
      <ProvingScreen />
    </div>
  );
}
