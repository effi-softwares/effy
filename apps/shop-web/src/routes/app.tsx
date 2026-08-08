import { useQuery } from "@tanstack/react-query";
import { createRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

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
import { ManagerOnlyScreen } from "@/features/shop-identity/ManagerOnlyScreen";
import { ProvingScreen } from "@/features/shop-identity/ProvingScreen";
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

  const identity = data?.status === "signed-in" ? data.identity : null;

  return (
    <ConsoleShell
      brand={{ mark: "E", name: "Effy", surface: "Shop" }}
      surfaceLabel="Effy Shop"
      nav={NAV}
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

// Sample series for the overview chart. ⚠ Illustrative, NOT live operations (console-shell
// contract C2): the label says so, and no figure here is read from the platform. Wiring live
// fulfillment metrics is a later slice.
const SAMPLE_ACTIVITY = [
  { day: "Mon", received: 18, ready: 14 },
  { day: "Tue", received: 22, ready: 20 },
  { day: "Wed", received: 15, ready: 15 },
  { day: "Thu", received: 27, ready: 23 },
  { day: "Fri", received: 31, ready: 28 },
  { day: "Sat", received: 24, ready: 22 },
  { day: "Sun", received: 12, ready: 12 },
];

const ACTIVITY_CONFIG = {
  received: { label: "Received", color: "var(--color-chart-1)" },
  ready: { label: "Ready", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

function DashboardScreen() {
  const { data } = useQuery(sessionQuery);
  const identity = data?.status === "signed-in" ? data.identity : null;
  return (
    <DashboardOverview
      title={`Welcome${identity?.email ? `, ${identity.email}` : ""}`}
      description="You're signed in to the Effy shop console."
      stats={[
        { label: "Orders to pick", value: "—", hint: "Live count arrives with fulfillment metrics" },
        { label: "Ready for pickup", value: "—", hint: "Illustrative until wired" },
        { label: "Catalog items", value: "—", hint: "Illustrative until wired" },
        { label: "Same-day areas", value: "—", hint: "Illustrative until wired" },
      ]}
      chart={
        <Card>
          <CardHeader>
            <CardTitle>Fulfillment activity</CardTitle>
            <CardDescription>Sample data — not live operations</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={ACTIVITY_CONFIG} className="h-[240px] w-full">
              <AreaChart data={SAMPLE_ACTIVITY} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Area
                  dataKey="received"
                  type="natural"
                  fill="var(--color-received)"
                  fillOpacity={0.2}
                  stroke="var(--color-received)"
                  stackId="a"
                />
                <Area
                  dataKey="ready"
                  type="natural"
                  fill="var(--color-ready)"
                  fillOpacity={0.2}
                  stroke="var(--color-ready)"
                  stackId="b"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      }
    >
      <ProvingScreen />
    </DashboardOverview>
  );
}
