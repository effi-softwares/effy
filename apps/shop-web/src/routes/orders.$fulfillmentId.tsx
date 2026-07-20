import { createRoute } from "@tanstack/react-router";

import { OrderDetailScreen } from "@/features/fulfillment/OrderDetailScreen";

import { appRoute } from "./app";

// The pick screen (020 US2/US3). The `fulfillmentId` path param is read at the route boundary and
// handed to the screen as a prop, so the screen stays router-agnostic and unit-testable.
//
// No client-side ownership check exists here, deliberately: the backend refuses another shop's
// portion — and a non-existent one — with the SAME uniform 403 (FR-019/FR-020), so guessing an id
// discloses nothing.
export const ordersDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders/$fulfillmentId",
  component: OrderDetailRoute,
});

function OrderDetailRoute() {
  const { fulfillmentId } = ordersDetailRoute.useParams();
  return <OrderDetailScreen fulfillmentId={fulfillmentId} />;
}
