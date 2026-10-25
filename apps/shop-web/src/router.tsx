import type { QueryClient } from "@tanstack/react-query"
import { createRouter } from "@tanstack/react-router"

import { appIndexRoute, appRoute, managerRoute } from "./routes/app"
import { authLayoutRoute, signInRoute } from "./routes/auth"
import { catalogRoute } from "./routes/catalog"
import { catalogNewRoute } from "./routes/catalog.new"
import { catalogAvailabilityRoute } from "./routes/catalog.availability"
import { catalogProductRoute } from "./routes/catalog.$productId"
import { insightsRoute } from "./routes/insights"
import { notificationSettingsRoute } from "./routes/settings.notifications"
import { printingSettingsRoute } from "./routes/settings.printing"
import { ordersRoute } from "./routes/orders"
import { ordersDetailRoute } from "./routes/orders.$fulfillmentId"
import { rootRoute } from "./routes/__root"

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([
    appIndexRoute,
    managerRoute,
    catalogRoute,
    catalogNewRoute,
    catalogAvailabilityRoute,
    catalogProductRoute,
    ordersRoute,
    ordersDetailRoute,
    notificationSettingsRoute,
    printingSettingsRoute,
    insightsRoute,
  ]),
  authLayoutRoute.addChildren([signInRoute]),
])

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
  })
}

type AppRouter = ReturnType<typeof createAppRouter>

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter
  }
}
