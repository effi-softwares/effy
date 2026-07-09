import { useQuery } from "@tanstack/react-query";
import { createRoute, Outlet } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";

import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireSession } from "@/features/auth/guards";
import { sessionQuery } from "@/features/auth/queries";
import { AdminOnlyScreen } from "@/features/staff-identity/AdminOnlyScreen";
import { ProvingScreen } from "@/features/staff-identity/ProvingScreen";
import { setSidebarOpen, uiStore } from "@/lib/ui-store";

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

// The default dashboard shell (FR-023 / Amendment D1, shadcn sidebar-07): a persistent collapsible
// sidebar + an inset header (trigger + breadcrumb) + the content region every screen renders into.
// The collapse bit is client-UI state owned by `uiStore` — the provider is driven controlled.
function AppShell() {
  const sidebarOpen = useStore(uiStore, (s) => s.sidebarOpen);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        {/* Content region: fills the pane, but capped + centered so ultrawide displays don't
            stretch content into over-long line lengths (FR-025 / D2-b). Generous cap — the root
            font-size scale (scale.css) does the "bigger on wide screens" work. */}
        <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 p-4">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
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
