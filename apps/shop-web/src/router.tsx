import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { appIndexRoute, appRoute, managerRoute } from "./routes/app";
import { authLayoutRoute, signInRoute } from "./routes/auth";
import { rootRoute } from "./routes/__root";

// Code-based route tree. Protected shell at '/' (+ '/manager'), public auth at '/auth/sign-in'.
const routeTree = rootRoute.addChildren([
  appRoute.addChildren([appIndexRoute, managerRoute]),
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
