import { useQuery } from "@tanstack/react-query";
import { createRoute, Outlet, useNavigate } from "@tanstack/react-router";

import { LiveProvider } from "@effy/web-kit/console";

import { StatusPage } from "@/components/patterns/StatusPage";
import { AppShell } from "@/components/shell/AppShell";
import { requireSession } from "@/features/auth/guards";
import { sessionQuery, useSignOut } from "@/features/auth/queries";
import { getLiveDescriptor } from "@/features/live/repo";
import { LIVE_ROUTES } from "@/features/live/routes";
import { AdminAccessScreen } from "@/features/staff-identity/AdminAccessScreen";
import { OverviewScreen } from "@/features/overview/OverviewScreen";

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
  component: AppShellRoute,
  notFoundComponent: () => <StatusPage kind="notfound" />,
});

export const appIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: DashboardScreen,
});

export const adminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "admin",
  component: AdminAccessScreen,
});

// The authenticated frame (the redesign's "Foundations and shell": shadcn sidebar-07 with grouped
// navigation, live counts, ⌘K search) — the consoles' one shell, shared with shop-web.
// Wired by hand — no DI framework.
function AppShellRoute() {
  const { data } = useQuery(sessionQuery);
  const signOut = useSignOut();
  const navigate = useNavigate();

  const identity = data?.status === "signed-in" ? data.identity : null;

  return (
    // Orders, dispatch and drivers, slot load and the review queue re-read when the platform
    // says they changed; nothing here refreshes on a timer. Open only while signed in.
    <LiveProvider enabled={identity !== null} loadDescriptor={getLiveDescriptor} routes={LIVE_ROUTES}>
      <AppShell
        email={identity?.email ?? ""}
        roles={identity?.roles ?? []}
        onSignOut={() =>
          signOut.mutate(undefined, { onSuccess: () => navigate({ to: "/auth/sign-in" }) })
        }
        signingOut={signOut.isPending}
      >
        <Outlet />
      </AppShell>
    </LiveProvider>
  );
}

// The Overview (redesign): what needs a person now, and how today's deliveries are going.
function DashboardScreen() {
  return <OverviewScreen />;
}
