import { createRoute } from "@tanstack/react-router";

import { ExceptionsScreen } from "@/features/exceptions/ExceptionsScreen";

import { appRoute } from "./app";

// Delivery exceptions, under the protected shell. No `requiredRole`: reading is open to every role including
// csa; closing one is admin/manager, hidden in the screen and enforced by the fleet service.
export const exceptionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "exceptions",
  component: ExceptionsScreen,
});
