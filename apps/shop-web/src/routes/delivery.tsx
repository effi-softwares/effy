import { createRoute } from "@tanstack/react-router";

import { SameDayScreen } from "@/features/delivery/SameDayScreen";

import { appRoute } from "./app";

// The shop's same-day declaration (032 US2), nested under the protected shell so its `beforeLoad`
// guards the session.
//
// ⚠ Deliberately NOT role-gated at the route. Any active shop member may READ what the shop has
// committed to — the people picking orders need to know. Only SUBMITTING is manager-only, and that is
// enforced by the backend (src/delivery/authz.ts), which is the authoritative gate; the screen
// disables its button to match, never as a substitute.
export const deliveryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "delivery",
  component: SameDayScreen,
});
