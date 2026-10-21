import { createRoute } from "@tanstack/react-router";

import { PrintingSettingsScreen } from "@/features/printing/PrintingSettings";

import { appRoute } from "./app";

// 096 — label printing settings for THIS computer. Under the protected layout; no role gate (every
// operator prints labels).
export const printingSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/printing",
  component: PrintingSettingsScreen,
});
