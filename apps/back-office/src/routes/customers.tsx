import { createRoute } from "@tanstack/react-router"

import { withActivityLog } from "@effy/web-kit/activity-log"

import { CustomerDetailScreen } from "@/features/customers/CustomerDetailScreen"
import { CustomersScreen, customersList } from "@/features/customers/CustomersScreen"

import { appRoute } from "./app"

export const customersIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "customers",
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.tab === "string" ? { tab: search.tab } : {}),
    ...customersList.validateSearch(search),
    // Points settings' rule changes (104).
    ...withActivityLog(search),
  }),
  component: CustomersScreen,
})

export const customerDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "customers/$customerId",
  validateSearch: (raw: Record<string, unknown>) => withActivityLog(raw),
  component: CustomerDetailRouteComponent,
})

function CustomerDetailRouteComponent() {
  const { customerId } = customerDetailRoute.useParams()
  return <CustomerDetailScreen customerId={customerId} />
}
