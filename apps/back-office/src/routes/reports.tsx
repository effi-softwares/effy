import { createRoute } from "@tanstack/react-router"

import { HandoverReportScreen } from "@/features/reports/handovers/HandoverReportScreen"

import { appRoute } from "./app"

export const handoverReportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "reports/handovers",
  component: HandoverReportScreen,
})
