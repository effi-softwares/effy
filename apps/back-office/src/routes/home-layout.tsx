import { createRoute } from "@tanstack/react-router";

import { HomeComposerScreen } from "@/features/home-layout/HomeComposerScreen";

import { appRoute } from "./app";

// The Home Composer (042 US1). Nests under the protected app shell (appRoute), so the session guard
// runs first. Read access is open to any signed-in back-office role — knowing what the storefront
// currently says is support work; the mutating controls are gated in the screen and independently
// enforced by the backend from the platform record.
export const homeLayoutRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "home-page",
  component: HomeComposerScreen,
});
