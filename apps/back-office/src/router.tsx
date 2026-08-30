import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { adminRoute, appIndexRoute, appRoute } from "./routes/app";
import { authLayoutRoute, signInRoute } from "./routes/auth";
import { catalogSchemaRoute } from "./routes/catalog-schema";
import {
  orderRulesRoute,
  promotionDetailRoute,
  promotionsIndexRoute,
} from "./routes/promotions";
import {
  deliverabilityDetailRoute,
  deliverabilityIndexRoute,
} from "./routes/deliverability";
import { deliveryIndexRoute } from "./routes/delivery";
import { feedbackDetailRoute, feedbackIndexRoute } from "./routes/feedback";
import {
  driverDetailRoute,
  driverExceptionsRoute,
  driversIndexRoute,
} from "./routes/drivers";
import { orderDetailRoute, ordersIndexRoute } from "./routes/orders";
import { shopDetailRoute, shopsIndexRoute } from "./routes/shops";
import { rootRoute } from "./routes/__root";

// Code-based route tree (research A5). Protected app shell at '/' (+ '/admin', '/shops',
// '/catalog', '/promotions'), public auth at '/auth/sign-in'.
const routeTree = rootRoute.addChildren([
  appRoute.addChildren([
    appIndexRoute,
    adminRoute,
    shopsIndexRoute,
    shopDetailRoute,
    ordersIndexRoute,
    orderDetailRoute,
    driversIndexRoute,
    // ⚠ The literal path before the parameterised one — see routes/drivers.tsx.
    driverExceptionsRoute,
    driverDetailRoute,
    deliverabilityIndexRoute,
    deliverabilityDetailRoute,
    feedbackIndexRoute,
    feedbackDetailRoute,
    catalogSchemaRoute,
    promotionsIndexRoute,
    orderRulesRoute,
    promotionDetailRoute,
    deliveryIndexRoute,
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
