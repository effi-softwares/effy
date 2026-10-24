import { createRoute } from "@tanstack/react-router";

import { AvailabilityScreen } from "@/features/catalog/AvailabilityScreen";

import { appRoute } from "./app";

// Every size the shop sells, its stock and its on-sale switch (099). Both shop roles: the product
// page already lets either take a size off sale.
export const catalogAvailabilityRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "catalog/availability",
  component: AvailabilityScreen,
});
