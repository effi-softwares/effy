import { createRoute } from "@tanstack/react-router"

import { withActivityLog } from "@effy/web-kit/activity-log"

import { DriverDetailScreen } from "@/features/drivers/DriverDetailScreen"
import { DriversListScreen } from "@/features/drivers/DriversListScreen"

import { driversList } from "@/features/drivers/model"

import { appRoute } from "./app"

export const driversIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "drivers",
  validateSearch: (raw: Record<string, unknown>) => ({
    ...(raw.panel === "readiness" ? { panel: "readiness" } : {}),
    ...driversList.validateSearch(raw),
  }),
  component: DriversListScreen,
})

export const driverDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "drivers/$driverId",
  validateSearch: (raw: Record<string, unknown>) => withActivityLog(raw),
  component: DriverDetailRouteComponent,
})

function DriverDetailRouteComponent() {
  const { driverId } = driverDetailRoute.useParams()
  return <DriverDetailScreen driverId={driverId} />
}
