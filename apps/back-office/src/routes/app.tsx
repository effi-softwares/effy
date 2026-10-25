import { useQuery } from "@tanstack/react-query"
import { createRoute, Outlet, useNavigate } from "@tanstack/react-router"

import { LiveProvider } from "@effy/web-kit/console"

import { StatusPage } from "@/components/patterns/StatusPage"
import { AppShell } from "@/components/shell/AppShell"
import { requireSession } from "@/features/auth/guards"
import { sessionQuery, useSignOut } from "@/features/auth/queries"
import { getLiveDescriptor } from "@/features/live/repo"
import { LIVE_ROUTES } from "@/features/live/routes"
import { AdminAccessScreen } from "@/features/staff-identity/AdminAccessScreen"
import { OverviewScreen } from "@/features/overview/OverviewScreen"

import { rootRoute } from "./__root"

export const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "protected",
  beforeLoad: async ({ context, location }) => {
    const identity = await requireSession(context.queryClient, location.href)
    return { identity }
  },
  component: AppShellRoute,
  notFoundComponent: () => <StatusPage kind="notfound" />,
})

export const appIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: OverviewScreen,
})

export const adminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "admin",
  component: AdminAccessScreen,
})

function AppShellRoute() {
  const { data } = useQuery(sessionQuery)
  const signOut = useSignOut()
  const navigate = useNavigate()

  const identity = data?.status === "signed-in" ? data.identity : null

  return (
    <LiveProvider enabled={identity !== null} loadDescriptor={getLiveDescriptor} routes={LIVE_ROUTES}>
      <AppShell
        email={identity?.email ?? ""}
        roles={identity?.roles ?? []}
        onSignOut={() => signOut.mutate(undefined, { onSuccess: () => navigate({ to: "/auth/sign-in" }) })}
        signingOut={signOut.isPending}
      >
        <Outlet />
      </AppShell>
    </LiveProvider>
  )
}
