import { createRoute } from "@tanstack/react-router"

import { InsightsScreen } from "@/features/insights/InsightsScreen"

import { appRoute } from "./app"

export const insightsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "insights",
  component: InsightsScreen,
})
