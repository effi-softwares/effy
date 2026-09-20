import { createRoute } from "@tanstack/react-router";

import { DriverDetailScreen } from "@/features/drivers/DriverDetailScreen";
import { DriversListScreen } from "@/features/drivers/DriversListScreen";

import { appRoute } from "./app";

// Driver management (056). Both routes nest under the protected app shell (appRoute), so the
// session guard runs first.
//
// Read access is open to every signed-in back-office role INCLUDING csa (FR-022) — a CSA is exactly
// who is asked "why did my delivery fail", and until this feature nobody at Effy could answer it.
// Mutating controls are gated in the screens and independently enforced by the backend.
//
// ⚠ `drivers/exceptions` WAS declared here, before `drivers/$driverId`, so the literal would win the
// match — anyone re-adding a literal driver route must put it back in that order, or it resolves to
// the profile screen with driverId="exceptions" and reads as a broken link rather than a routing
// mistake. The screen itself went with the work model it read.
export const driversIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "drivers",
  component: DriversListScreen,
});

export const driverDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "drivers/$driverId",
  component: DriverDetailRouteComponent,
});

function DriverDetailRouteComponent() {
  const { driverId } = driverDetailRoute.useParams();
  return <DriverDetailScreen driverId={driverId} />;
}
