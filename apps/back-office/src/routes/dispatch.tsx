import { createRoute, redirect } from "@tanstack/react-router";

import { appRoute } from "./app";

// The dispatch page moved into orders (the Assignments tab). These two routes exist only so
// a bookmark or an old link still lands somewhere useful; nothing renders here.
export const dispatchIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "dispatch",
  beforeLoad: () => {
    throw redirect({ to: "/orders/assignments" });
  },
});

export const dispatchRoundRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "dispatch/rounds/$roundId",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/orders/assignments/rounds/$roundId", params: { roundId: params.roundId } });
  },
});
