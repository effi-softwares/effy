import { createRoute, useNavigate } from "@tanstack/react-router";

import { OrderListScreen } from "@/features/fulfillment/OrderListScreen";
import { validateOrdersSearch } from "@/features/fulfillment/orderConsole";

import { appRoute } from "./app";

// The Orders list, under the protected shell. Not role-gated: both shop roles have full fulfilment access.
// Tab, search, filters, sort and page are search params, so back from an order lands on the same page.
export const ordersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders",
  validateSearch: validateOrdersSearch,
  component: OrdersRoute,
});

function OrdersRoute() {
  const search = ordersRoute.useSearch();
  const navigate = useNavigate();
  return (
    <OrderListScreen
      search={search}
      onSearchChange={(next) => void navigate({ to: "/orders", search: next, replace: true })}
      onOpenOrder={(fulfillmentId) =>
        void navigate({ to: "/orders/$fulfillmentId", params: { fulfillmentId }, search })
      }
    />
  );
}
