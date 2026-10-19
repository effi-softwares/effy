// TEMPORARY visual harness — deleted after screenshots. Not part of the app.
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { StatusPage } from "@/components/patterns/StatusPage";
import { OverviewScreen } from "@/features/overview/OverviewScreen";
import { SignInScreen } from "@/features/auth/SignInScreen";
import { OrdersListScreen } from "@/features/orders/OrdersListScreen";
import { OrderDetailScreen } from "@/features/orders/OrderDetailScreen";
import { SEED } from "./zz-seed";
import "./styles.css";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
for (const [k, v] of SEED) qc.setQueryData(k, v);
const params = new URLSearchParams(location.search);
const page = params.get("page") ?? "overview";

const root = createRootRoute({ component: () => page === "signin" ? <Outlet /> : <AppShell email="alex.chen@example.com" roles={["manager"]} onSignOut={() => {}} signingOut={false}><Outlet /></AppShell> });
const index = createRoute({ getParentRoute: () => root, path: "/", component: () => page === "signin" ? <SignInScreen /> : page === "notfound" ? <StatusPage kind="notfound" /> : page === "denied" ? <StatusPage kind="denied" /> : page === "orders" ? <OrdersListScreen /> : page === "order" ? <OrderDetailScreen orderId="o9" /> : <OverviewScreen /> });
const router = createRouter({ routeTree: root.addChildren([index]), history: createMemoryHistory({ initialEntries: ["/"] }) });
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>);
