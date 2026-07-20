import { createRoute } from "@tanstack/react-router";

import { OrderQueueScreen } from "@/features/fulfillment/OrderQueueScreen";

import { appRoute } from "./app";

// The order queue (020 US1/US4), nested under the protected shell so its `beforeLoad` guards the
// session. NOT role-gated: both shop_manager and shop_staff have full fulfilment access (FR-019a) —
// the people standing at the shelves are the primary users of this screen.
export const ordersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders",
  component: OrderQueueScreen,
});
