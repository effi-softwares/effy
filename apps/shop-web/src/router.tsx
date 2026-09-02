import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { appIndexRoute, appRoute, managerRoute } from "./routes/app";
import { authLayoutRoute, signInRoute } from "./routes/auth";
import { catalogRoute } from "./routes/catalog";
import { catalogNewRoute } from "./routes/catalog.new";
import { restockRoute } from "./routes/restock";
import { catalogProductRoute } from "./routes/catalog.$productId";
import { ordersRoute } from "./routes/orders";
import { ordersDetailRoute } from "./routes/orders.$fulfillmentId";
import { rootRoute } from "./routes/__root";

// Code-based route tree. Protected shell at '/' (+ '/manager', '/catalog', '/catalog/$productId',
// '/orders', '/orders/$fulfillmentId'), public auth at '/auth/sign-in'.
const routeTree = rootRoute.addChildren([
  appRoute.addChildren([
    appIndexRoute,
    managerRoute,
    catalogRoute,
    // ⚠ BEFORE the $productId route: "new" would otherwise be captured as a product id and answer 404.
    catalogNewRoute,
    restockRoute,
    catalogProductRoute,
    ordersRoute,
    ordersDetailRoute,
  ]),
  authLayoutRoute.addChildren([signInRoute]),
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
