import { createRoute } from "@tanstack/react-router";

import { HubStationScreen } from "@/features/hub/HubStationScreen";

import { appRoute } from "./app";

// 096 US5 — the hub station. Admin and manager (hidden for csa in the rail); the fleet service refuses
// anyone else on every route, which is the guard.
export const hubRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "hub",
  component: HubStationScreen,
});
