import { createRoute } from "@tanstack/react-router";

import { DeliveryScreen } from "@/features/delivery/DeliveryScreen";

import { appRoute } from "./app";

// Delivery configuration (047): zones, rings, fee plans, hub settings. Nested under the protected app
// shell (session guard runs first). Read is open to any signed-in back-office role; mutating controls
// are gated in-screen and independently enforced by the backend from the platform record.
export const deliveryIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "delivery",
  // 083 — which tab is open; the go-live checklist links to the tab that fixes each item.
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === "string" ? { tab: search.tab } : {},
  component: DeliveryScreen,
});
