import { createRoute, Outlet } from "@tanstack/react-router";

import { SignInScreen } from "@/features/auth/SignInScreen";

import { rootRoute } from "./__root";

// Public auth area — centered layout hosting the sign-in / verify flow.
export const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  component: () => (
    <div className="grid min-h-dvh place-items-center bg-background p-6">
      <Outlet />
    </div>
  ),
});

export const signInRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "sign-in",
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  component: SignInRouteComponent,
});

function SignInRouteComponent() {
  const { next } = signInRoute.useSearch();
  return <SignInScreen next={next} />;
}
