import { createRoute } from "@tanstack/react-router"

import { OrderDetailScreen } from "@/features/fulfillment/OrderDetailScreen"
import { validateOrdersSearch } from "@/features/fulfillment/orderConsole"

import { appRoute } from "./app"

export const ordersDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders/$fulfillmentId",
  validateSearch: validateOrdersSearch,
  component: OrderDetailRoute,
})

function OrderDetailRoute() {
  const { fulfillmentId } = ordersDetailRoute.useParams()
  return <OrderDetailScreen fulfillmentId={fulfillmentId} />
}
