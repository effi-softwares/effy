import { createRoute } from "@tanstack/react-router";

import { TaxSettingsScreen } from "@/features/settings/tax/TaxSettingsScreen";

import { appRoute } from "./app";

// 096 US8 — Settings → Tax. Admin only (hidden from others in the rail; the orders service refuses
// anyone else on every route, which is the guard).
export const taxSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/tax",
  component: TaxSettingsScreen,
});
