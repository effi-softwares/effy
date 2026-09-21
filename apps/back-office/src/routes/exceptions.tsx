import { createRoute } from "@tanstack/react-router";

import { ExceptionsScreen } from "@/features/exceptions/ExceptionsScreen";

import { appRoute } from "./app";

// Delivery exceptions (064). Nests under the protected app shell, so the session guard runs first.
//
// ⚠ NO `requiredRole`, and that is deliberate — the same reasoning as Dispatch, Drivers and
// Vehicles. Reading is open to every signed-in back-office role INCLUDING csa: a CSA is exactly who
// is asked "where is my order", and 056 found this capability missing precisely because a failed
// delivery reached nobody. CLOSING one is admin/manager, hidden in the screen and independently
// enforced by edge-fleet per route.
export const exceptionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "exceptions",
  component: ExceptionsScreen,
});
