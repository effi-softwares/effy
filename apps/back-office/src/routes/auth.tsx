import { createRoute } from "@tanstack/react-router"

import { SignInScreen } from "@/features/auth/SignInScreen"

import { rootRoute } from "./__root"

export const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
})

export const signInRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "sign-in",
  validateSearch: (search: Record<string, unknown>): { next?: string; ended?: "1" } => ({
    next: typeof search.next === "string" ? search.next : undefined,
    // 119 R8: the team record ended this person's access; sign-in says so.
    ...(search.ended === "1" || search.ended === 1 ? { ended: "1" as const } : {}),
  }),
  component: SignInRouteComponent,
})

function SignInRouteComponent() {
  const { next, ended } = signInRoute.useSearch()
  return <SignInScreen next={next} accessEnded={ended === "1"} />
}
