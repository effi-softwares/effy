import { createRoute } from "@tanstack/react-router";

import { OrderDetailScreen } from "@/features/orders/OrderDetailScreen";
import { OrdersListScreen } from "@/features/orders/OrdersListScreen";

import { appRoute } from "./app";

// The order console (053). Both routes nest under the protected app shell (appRoute), so the session
// guard runs first. Read access is open to any signed-in back-office role INCLUDING csa — triage is
// their work, and until this feature they could not see a single order they were being asked about.
// Recording a handover or an arrival is gated in-screen (and independently enforced by the backend).
export const ordersIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders",
  component: OrdersListScreen,
});

export const orderDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders/$orderId",
  component: OrderDetailRouteComponent,
});

function OrderDetailRouteComponent() {
  const { orderId } = orderDetailRoute.useParams();
  return <OrderDetailScreen orderId={orderId} />;
}
