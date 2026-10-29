import { createRoute } from "@tanstack/react-router"

import { withActivityLog } from "@effy/web-kit/activity-log"

import { VehicleDetailScreen } from "@/features/vehicles/VehicleDetailScreen"
import { VehiclesListScreen } from "@/features/vehicles/VehiclesListScreen"

import { vehiclesList } from "@/features/vehicles/model"

import { appRoute } from "./app"

export const vehiclesIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "vehicles",
  validateSearch: (raw: Record<string, unknown>) => ({
    ...vehiclesList.validateSearch(raw),
  }),
  component: VehiclesListScreen,
})

export const vehicleDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "vehicles/$vehicleId",
  validateSearch: (raw: Record<string, unknown>) => withActivityLog(raw),
  component: VehicleDetailRouteComponent,
})

function VehicleDetailRouteComponent() {
  const { vehicleId } = vehicleDetailRoute.useParams()
  return <VehicleDetailScreen vehicleId={vehicleId} />
}
