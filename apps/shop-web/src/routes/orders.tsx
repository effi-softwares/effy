import { createRoute, useNavigate } from "@tanstack/react-router"

import { OrderListScreen } from "@/features/fulfillment/OrderListScreen"
import { validateOrdersSearch } from "@/features/fulfillment/orderConsole"

import { appRoute } from "./app"

export const ordersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders",
  validateSearch: validateOrdersSearch,
  component: OrdersRoute,
})

function OrdersRoute() {
  const search = ordersRoute.useSearch()
  const navigate = useNavigate()
  return (
    <OrderListScreen
      search={search}
      onSearchChange={(next) => void navigate({ to: "/orders", search: next, replace: true })}
    />
  )
}
