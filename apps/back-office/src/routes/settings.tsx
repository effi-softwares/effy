import { createRoute } from "@tanstack/react-router"

import { TaxSettingsScreen } from "@/features/settings/tax/TaxSettingsScreen"

import { appRoute } from "./app"

export const taxSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/tax",
  component: TaxSettingsScreen,
})
