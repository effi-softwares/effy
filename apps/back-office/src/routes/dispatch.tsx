import { createRoute } from "@tanstack/react-router";

import { DispatchDayScreen } from "@/features/dispatch/DispatchDayScreen";
import { RoundDetailScreen } from "@/features/dispatch/RoundDetailScreen";

import { appRoute } from "./app";

// The dispatcher console (063). Both routes nest under the protected app shell (appRoute), so the
// session guard runs first.
//
// Read access is open to every signed-in back-office role INCLUDING csa — seeing what is stuck is
// not the same as changing it, and a CSA is exactly who is asked "where is that order". Mutating
// controls are hidden in the screens and independently enforced by edge-fleet per route.
export const dispatchIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "dispatch",
  component: DispatchDayScreen,
});

export const dispatchRoundRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "dispatch/rounds/$roundId",
  component: DispatchRoundRouteComponent,
});

function DispatchRoundRouteComponent() {
  const { roundId } = dispatchRoundRoute.useParams();
  return <RoundDetailScreen roundId={roundId} />;
}
