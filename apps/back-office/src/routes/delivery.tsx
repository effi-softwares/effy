import { createRoute } from "@tanstack/react-router"

import { DeliveryScreen } from "@/features/delivery/DeliveryScreen"

import { coverageList } from "@/features/delivery/coverage/list"

import { appRoute } from "./app"

export const deliveryIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "delivery",
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.tab === "string" ? { tab: search.tab } : {}),
    ...coverageList.validateSearch(search),
  }),
  component: DeliveryScreen,
})
