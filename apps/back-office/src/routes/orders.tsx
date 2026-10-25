import { createRoute } from "@tanstack/react-router"

import { CourierScreen } from "@/features/orders/CourierScreen"
import { OrderDetailScreen } from "@/features/orders/OrderDetailScreen"
import { ORDER_VIEWS, OrdersListScreen, type OrdersSearch, type OrderView } from "@/features/orders/OrdersListScreen"
import { DispatchDayScreen } from "@/features/dispatch/DispatchDayScreen"
import { RoundDetailScreen } from "@/features/dispatch/RoundDetailScreen"

import { appRoute } from "./app"

export const ordersIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders",
  validateSearch: (search: Record<string, unknown>): OrdersSearch => ({
    ...(typeof search.view === "string" && (ORDER_VIEWS as readonly string[]).includes(search.view)
      ? { view: search.view as OrderView }
      : {}),
    ...(search.delivery === "effy" || search.delivery === "courier" ? { delivery: search.delivery } : {}),
    ...(search.sold === "window" || search.sold === "day" || search.sold === "asap" ? { sold: search.sold } : {}),
  }),
  component: OrdersListScreen,
})

export const ordersHandoverRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders/handover",
  component: CourierScreen,
})

export const ordersAssignmentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders/assignments",
  component: DispatchDayScreen,
})

export const ordersAssignmentRoundRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders/assignments/rounds/$roundId",
  component: AssignmentRoundRouteComponent,
})

function AssignmentRoundRouteComponent() {
  const { roundId } = ordersAssignmentRoundRoute.useParams()
  return <RoundDetailScreen roundId={roundId} />
}

export const orderDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "orders/$orderId",
  component: OrderDetailRouteComponent,
  // Opened from a scan: the bag (or package) to highlight.
  validateSearch: (search: Record<string, unknown>): { parcel?: string; package?: string } => ({
    ...(typeof search.parcel === "string" ? { parcel: search.parcel } : {}),
    ...(typeof search.package === "string" ? { package: search.package } : {}),
  }),
})

function OrderDetailRouteComponent() {
  const { orderId } = orderDetailRoute.useParams()
  const { parcel, package: pkg } = orderDetailRoute.useSearch()
  return (
    <OrderDetailScreen orderId={orderId} highlight={parcel || pkg ? { parcelId: parcel, packageId: pkg } : undefined} />
  )
}
