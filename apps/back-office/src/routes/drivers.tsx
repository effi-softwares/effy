import { createRoute } from "@tanstack/react-router";

import { DriverDetailScreen } from "@/features/drivers/DriverDetailScreen";
import { DriversListScreen } from "@/features/drivers/DriversListScreen";
import { ExceptionsScreen } from "@/features/drivers/ExceptionsScreen";

import { appRoute } from "./app";

// Driver management (056). All three routes nest under the protected app shell (appRoute), so the
// session guard runs first.
//
// Read access is open to every signed-in back-office role INCLUDING csa (FR-022) — a CSA is exactly
// who is asked "why did my delivery fail", and until this feature nobody at Effy could answer it.
// Mutating controls are gated in the screens and independently enforced by the backend.
//
// ⚠ `drivers/exceptions` is declared BEFORE `drivers/$driverId`, so the literal wins the match. The
// reverse order would route /drivers/exceptions to the profile screen with driverId="exceptions",
// which 404s from the API and reads as a broken link rather than a routing mistake.
export const driversIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "drivers",
  component: DriversListScreen,
});

export const driverExceptionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "drivers/exceptions",
  component: ExceptionsScreen,
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
