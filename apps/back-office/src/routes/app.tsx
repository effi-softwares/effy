import { useQuery } from "@tanstack/react-query";
import { createRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireSession } from "@/features/auth/guards";
import { isAdmin } from "@/features/auth/model";
import { sessionQuery, useSignOut } from "@/features/auth/queries";
import { AdminOnlyScreen } from "@/features/staff-identity/AdminOnlyScreen";
import { ProvingScreen } from "@/features/staff-identity/ProvingScreen";
import { toggleTheme, uiStore } from "@/lib/ui-store";

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

function AppShell() {
  const { data } = useQuery(sessionQuery);
  const signOut = useSignOut();
  const navigate = useNavigate();
  const identity = data?.status === "signed-in" ? data.identity : null;
  const roles = identity?.roles ?? [];
  const theme = useStore(uiStore, (s) => s.theme);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-primary">Effy Back-Office</span>
          <nav className="flex gap-4 text-sm">
            <Link to="/" className="text-muted-foreground [&.active]:text-foreground">
              Dashboard
            </Link>
            {isAdmin(roles) ? (
              <Link to="/admin" className="text-muted-foreground [&.active]:text-foreground">
                Admin
              </Link>
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {identity?.email ? (
            <span className="text-sm text-muted-foreground">{identity.email}</span>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            onClick={() => toggleTheme()}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={signOut.isPending}
            onClick={() =>
              signOut.mutate(undefined, {
                onSuccess: () => navigate({ to: "/auth/sign-in" }),
              })
            }
          >
            Sign out
          </Button>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
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
          You're signed in. Role-aware areas arrive with US3.
        </p>
      </div>
      <ProvingScreen />
    </div>
  );
}
