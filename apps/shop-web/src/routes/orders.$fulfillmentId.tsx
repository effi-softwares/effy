import { createRoute } from "@tanstack/react-router";

import { OrderDetailScreen } from "@/features/fulfillment/OrderDetailScreen";
import { validateOrdersSearch } from "@/features/fulfillment/orderConsole";

import { appRoute } from "./app";

// Order detail. The path param is read here and passed as a prop, keeping the screen router-agnostic.
// The search params are the list the order was opened from, for the header's pagination and the "Orders"
// crumb. No client ownership check: the backend refuses another shop's portion and a missing one with the
// same 403.
export const ordersDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders/$fulfillmentId",
  validateSearch: validateOrdersSearch,
  component: OrderDetailRoute,
});

function OrderDetailRoute() {
  const { fulfillmentId } = ordersDetailRoute.useParams();
  return <OrderDetailScreen fulfillmentId={fulfillmentId} />;
}
