import { useQuery } from "@tanstack/react-query";
import { createRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@effy/design-system/ui";
import { ConsoleShell, DashboardOverview } from "@effy/web-kit/console";

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

// Sample series for the overview chart. ⚠ Illustrative, NOT live operations (console-shell
// contract C2): no figure here is read from the platform.
const SAMPLE_SHOPS = [
  { region: "North", active: 4, suspended: 1 },
  { region: "South", active: 6, suspended: 0 },
  { region: "East", active: 3, suspended: 1 },
  { region: "West", active: 5, suspended: 2 },
];

const SHOPS_CONFIG = {
  active: { label: "Active", color: "var(--color-chart-1)" },
  suspended: { label: "Suspended", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

function DashboardScreen() {
  const { data } = useQuery(sessionQuery);
  const identity = data?.status === "signed-in" ? data.identity : null;
  return (
    <DashboardOverview
      title={`Welcome${identity?.email ? `, ${identity.email}` : ""}`}
      description="You're signed in to the Effy back-office console."
      stats={[
        { label: "Shops", value: "—", hint: "Live count arrives with admin metrics" },
        { label: "Staff", value: "—", hint: "Illustrative until wired" },
        { label: "Active promotions", value: "—", hint: "Illustrative until wired" },
        { label: "Delivery events (24h)", value: "—", hint: "Illustrative until wired" },
      ]}
      chart={
        <Card>
          <CardHeader>
            <CardTitle>Shops by region</CardTitle>
            <CardDescription>Sample data — not live operations</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={SHOPS_CONFIG} className="h-[240px] w-full">
              <BarChart data={SAMPLE_SHOPS} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="region" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="active" fill="var(--color-active)" radius={4} />
                <Bar dataKey="suspended" fill="var(--color-suspended)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      }
    >
      <ProvingScreen />
    </DashboardOverview>
  );
}
