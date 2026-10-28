import { createRoute } from "@tanstack/react-router"

import { availabilityList } from "@/features/catalog/availability"
import { AvailabilityScreen } from "@/features/catalog/AvailabilityScreen"

import { appRoute } from "./app"

export const catalogAvailabilityRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "catalog/availability",
  validateSearch: (raw: Record<string, unknown>) => availabilityList.validateSearch(raw),
  component: AvailabilityScreen,
})
