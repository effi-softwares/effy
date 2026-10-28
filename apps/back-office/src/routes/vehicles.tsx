import { createRoute } from "@tanstack/react-router"

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
  component: VehicleDetailRouteComponent,
})

function VehicleDetailRouteComponent() {
  const { vehicleId } = vehicleDetailRoute.useParams()
  return <VehicleDetailScreen vehicleId={vehicleId} />
}
