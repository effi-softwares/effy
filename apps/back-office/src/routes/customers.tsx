import { createRoute, redirect } from "@tanstack/react-router"

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
  }),
  // Points settings were a tab here; they live in Settings now.
  beforeLoad: ({ search }) => {
    if ((search as { tab?: string }).tab === "settings") throw redirect({ to: "/settings/points", replace: true })
  },
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
