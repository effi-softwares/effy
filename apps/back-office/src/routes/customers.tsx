import { createRoute } from "@tanstack/react-router";

import { CustomerDetailScreen } from "@/features/customers/CustomerDetailScreen";
import { CustomersScreen } from "@/features/customers/CustomersScreen";

import { appRoute } from "./app";

// 074 — customers and their points. Under the protected shell; read is open to every back-office
// role including csa. Debit and settings are gated in-screen and enforced by the orders service.
export const customersIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "customers",
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
