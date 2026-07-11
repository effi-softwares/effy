import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { adminRoute, appIndexRoute, appRoute } from "./routes/app";
import { authLayoutRoute, signInRoute } from "./routes/auth";
import { shopDetailRoute, shopsIndexRoute } from "./routes/shops";
import { rootRoute } from "./routes/__root";

// Code-based route tree (research A5). Protected app shell at '/' (+ '/admin', '/shops'), public
// auth at '/auth/sign-in'.
const routeTree = rootRoute.addChildren([
  appRoute.addChildren([appIndexRoute, adminRoute, shopsIndexRoute, shopDetailRoute]),
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
