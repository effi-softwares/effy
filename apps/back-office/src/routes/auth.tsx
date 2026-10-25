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
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  component: SignInRouteComponent,
})

function SignInRouteComponent() {
  const { next } = signInRoute.useSearch()
  return <SignInScreen next={next} />
}
