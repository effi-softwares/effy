import { createRoute } from "@tanstack/react-router"

import { CustomerDetailScreen } from "@/features/customers/CustomerDetailScreen"
import { CustomersScreen } from "@/features/customers/CustomersScreen"

import { appRoute } from "./app"

export const customersIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "customers",
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === "string" ? { tab: search.tab } : {},
  component: CustomersScreen,
})

export const customerDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "customers/$customerId",
  component: CustomerDetailRouteComponent,
})

function CustomerDetailRouteComponent() {
  const { customerId } = customerDetailRoute.useParams()
  return <CustomerDetailScreen customerId={customerId} />
}
