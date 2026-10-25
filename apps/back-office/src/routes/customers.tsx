import { createRoute } from "@tanstack/react-router";

import { CustomerDetailScreen } from "@/features/customers/CustomerDetailScreen";
import { CustomersScreen } from "@/features/customers/CustomersScreen";

import { appRoute } from "./app";

// Customers and their points. Under the protected shell; read is open to every back-office
// role including csa. Debit and settings are gated in-screen and enforced by the orders service.
export const customersIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "customers",
  // Which tab is open — the sidebar's Settings › Points opens the settings tab directly.
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === "string" ? { tab: search.tab } : {},
  component: CustomersScreen,
});

export const customerDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "customers/$customerId",
  component: CustomerDetailRouteComponent,
});

function CustomerDetailRouteComponent() {
  const { customerId } = customerDetailRoute.useParams();
  return <CustomerDetailScreen customerId={customerId} />;
}
