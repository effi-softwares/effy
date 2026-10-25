import { createRoute } from "@tanstack/react-router"

import { DeliveryScreen } from "@/features/delivery/DeliveryScreen"

import { appRoute } from "./app"

export const deliveryIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "delivery",
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === "string" ? { tab: search.tab } : {},
  component: DeliveryScreen,
})
