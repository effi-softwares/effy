import { createRoute, useNavigate } from "@tanstack/react-router";

import { OrderDetailScreen } from "@/features/fulfillment/OrderDetailScreen";
import { validateOrdersSearch } from "@/features/fulfillment/orderConsole";

import { appRoute } from "./app";

// Order detail (020 US2/US3, rebuilt by 057 A3). The `fulfillmentId` path param is read at the route
// boundary and handed to the screen as a prop, so the screen stays router-agnostic and unit-testable.
//
// The search params are the LIST's — the one this order was opened from — carried so previous/next
// walks that list and the header's "Orders" crumb returns to it.
//
// No client-side ownership check exists here, deliberately: the backend refuses another shop's
// portion — and a non-existent one — with the SAME uniform 403 (FR-019/FR-020), so guessing an id
// discloses nothing.
export const ordersDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders/$fulfillmentId",
  validateSearch: validateOrdersSearch,
  component: OrderDetailRoute,
});

function OrderDetailRoute() {
  const { fulfillmentId } = ordersDetailRoute.useParams();
  const search = ordersDetailRoute.useSearch();
  const navigate = useNavigate();
  return (
    <OrderDetailScreen
      fulfillmentId={fulfillmentId}
      search={search}
      onNavigate={(id, nextSearch) =>
        void navigate({ to: "/orders/$fulfillmentId", params: { fulfillmentId: id }, search: nextSearch })
      }
    />
  );
}
