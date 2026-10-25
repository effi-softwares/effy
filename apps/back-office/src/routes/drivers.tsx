import { createRoute } from "@tanstack/react-router"

import { DriverDetailScreen } from "@/features/drivers/DriverDetailScreen"
import { DriversListScreen } from "@/features/drivers/DriversListScreen"

import { appRoute } from "./app"

export const driversIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "drivers",
  component: DriversListScreen,
})

export const driverDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "drivers/$driverId",
  component: DriverDetailRouteComponent,
})

function DriverDetailRouteComponent() {
  const { driverId } = driverDetailRoute.useParams()
  return <DriverDetailScreen driverId={driverId} />
}
