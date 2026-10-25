import { createRoute } from "@tanstack/react-router"

import { PrintingSettingsScreen } from "@/features/printing/PrintingSettings"

import { appRoute } from "./app"

export const printingSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/printing",
  component: PrintingSettingsScreen,
})
