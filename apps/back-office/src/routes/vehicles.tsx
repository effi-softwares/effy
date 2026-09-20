import { createRoute } from "@tanstack/react-router";

import { VehicleDetailScreen } from "@/features/vehicles/VehicleDetailScreen";
import { VehiclesListScreen } from "@/features/vehicles/VehiclesListScreen";

import { appRoute } from "./app";

// The vehicle register (061). Both routes nest under the protected app shell (appRoute), so the
// session guard runs first.
//
// Read access is open to every signed-in back-office role INCLUDING csa — a CSA is exactly who is
// asked "where is that order" and needs to see which van is out with whom. Mutating controls are
// gated in the screens and independently enforced by the backend.
export const vehiclesIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "vehicles",
  component: VehiclesListScreen,
});

export const vehicleDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "vehicles/$vehicleId",
  component: VehicleDetailRouteComponent,
});

function VehicleDetailRouteComponent() {
  const { vehicleId } = vehicleDetailRoute.useParams();
  return <VehicleDetailScreen vehicleId={vehicleId} />;
}
