import { createRoute } from "@tanstack/react-router"

import { withActivityLog } from "@effy/web-kit/activity-log"

import { DeliverabilityDetailScreen } from "@/features/deliverability/DeliverabilityDetailScreen"
import { DeliverabilityListScreen } from "@/features/deliverability/DeliverabilityListScreen"

import { deliverabilityList } from "@/features/deliverability/model"

import { appRoute } from "./app"

export const deliverabilityIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "deliverability",
  validateSearch: (raw: Record<string, unknown>) => deliverabilityList.validateSearch(raw),
  component: DeliverabilityListScreen,
})

export const deliverabilityDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "deliverability/$address",
  validateSearch: (raw: Record<string, unknown>) => withActivityLog(raw),
  component: DeliverabilityDetailRouteComponent,
})

function DeliverabilityDetailRouteComponent() {
  const { address } = deliverabilityDetailRoute.useParams()
  return <DeliverabilityDetailScreen address={address} />
}
