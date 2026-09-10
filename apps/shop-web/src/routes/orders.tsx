import { createRoute, useNavigate } from "@tanstack/react-router";

import { OrderListScreen } from "@/features/fulfillment/OrderListScreen";
import { validateOrdersSearch } from "@/features/fulfillment/orderConsole";

import { appRoute } from "./app";

// The Orders list (020 US1/US4, rebuilt by 057 A3), nested under the protected shell so its
// `beforeLoad` guards the session. NOT role-gated: both shop_manager and shop_staff have full
// fulfilment access (FR-019a) — the people standing at the shelves are the primary users of this screen.
//
// ⚠ The list's tab, search, filters, sort and page are SEARCH PARAMS, so back from an order lands on
// the same page and the order's previous/next knows which list it came from.
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
