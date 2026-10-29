import { createRoute } from "@tanstack/react-router"

import { withActivityLog } from "@effy/web-kit/activity-log"

import { OrderDetailScreen } from "@/features/fulfillment/OrderDetailScreen"
import { validateOrdersSearch } from "@/features/fulfillment/orderConsole"

import { appRoute } from "./app"

export const ordersDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders/$fulfillmentId",
  // The order list's view rides along (Back to the list keeps it), beside the activity drawer's (104).
  validateSearch: (raw: Record<string, unknown>) => ({ ...validateOrdersSearch(raw), ...withActivityLog(raw) }),
  component: OrderDetailRoute,
})

function OrderDetailRoute() {
  const { fulfillmentId } = ordersDetailRoute.useParams()
  return <OrderDetailScreen fulfillmentId={fulfillmentId} />
}
