import { createRoute } from "@tanstack/react-router";

import { CourierScreen } from "@/features/orders/CourierScreen";
import { OrderDetailScreen } from "@/features/orders/OrderDetailScreen";
import { OrdersListScreen } from "@/features/orders/OrdersListScreen";
import { DispatchDayScreen } from "@/features/dispatch/DispatchDayScreen";
import { RoundDetailScreen } from "@/features/dispatch/RoundDetailScreen";

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

// 069 — what must be handed to the carrier, by when. Read-only for every role; a static segment, so
// it is matched ahead of the `$orderId` route below.
export const ordersHandoverRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders/handover",
  component: CourierScreen,
});

// 073 — the dispatcher's view lives inside Orders now, as the Assignments tab.
export const ordersAssignmentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders/assignments",
  component: DispatchDayScreen,
});

export const ordersAssignmentRoundRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders/assignments/rounds/$roundId",
  component: AssignmentRoundRouteComponent,
});

function AssignmentRoundRouteComponent() {
  const { roundId } = ordersAssignmentRoundRoute.useParams();
  return <RoundDetailScreen roundId={roundId} />;
}

export const orderDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders/$orderId",
  component: OrderDetailRouteComponent,
});

function OrderDetailRouteComponent() {
  const { orderId } = orderDetailRoute.useParams();
  return <OrderDetailScreen orderId={orderId} />;
}
