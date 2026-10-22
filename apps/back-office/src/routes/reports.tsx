import { createRoute } from "@tanstack/react-router";

import { HandoverReportScreen } from "@/features/reports/handovers/HandoverReportScreen";

import { appRoute } from "./app";

// 096 US6 — the hand-over report. Every back-office role may read it (the fleet route allows any
// active staff), like Dispatch.
export const handoverReportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "reports/handovers",
  component: HandoverReportScreen,
});
