import { createRoute } from "@tanstack/react-router"

import { AvailabilityScreen } from "@/features/catalog/AvailabilityScreen"

import { appRoute } from "./app"

export const catalogAvailabilityRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "catalog/availability",
  component: AvailabilityScreen,
})
