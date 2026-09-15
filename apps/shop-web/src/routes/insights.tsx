import { createRoute } from "@tanstack/react-router";

import { InsightsScreen } from "@/features/insights/InsightsScreen";

import { appRoute } from "./app";

// 058 — Insights. Nested under the protected layout, so the session guard and the shop gate apply
// exactly as they do everywhere else; the screen itself asserts no access rules of its own.
export const insightsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "insights",
  component: InsightsScreen,
});
