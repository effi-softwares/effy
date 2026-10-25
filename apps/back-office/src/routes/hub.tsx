import { createRoute } from "@tanstack/react-router"

import { HubStationScreen } from "@/features/hub/HubStationScreen"

import { appRoute } from "./app"

export const hubRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "hub",
  component: HubStationScreen,
})
