import { createRoute } from "@tanstack/react-router";

import { LowStockScreen } from "@/features/catalog/LowStockScreen";

import { appRoute } from "./app";

// The restock list (054 US5), nested under the protected shell so its `beforeLoad` guards the
// session. Ungated by role: both shop roles manage stock (FR-010, A7), and the people standing at
// the shelves are exactly who needs this list.
export const restockRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "restock",
  component: LowStockScreen,
});
