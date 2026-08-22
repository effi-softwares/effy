import { createRoute } from "@tanstack/react-router";

import { DeliveryScreen } from "@/features/delivery/DeliveryScreen";

import { appRoute } from "./app";

// Delivery configuration (047): zones, rings, fee plans, hub settings. Nested under the protected app
// shell (session guard runs first). Read is open to any signed-in back-office role; mutating controls
// are gated in-screen and independently enforced by the backend from the platform record.
export const deliveryIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "delivery",
  component: DeliveryScreen,
});
