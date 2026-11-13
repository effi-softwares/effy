import { useQuery } from "@tanstack/react-query"
import { createRoute, Outlet, useNavigate } from "@tanstack/react-router"

import { LiveProvider } from "@effy/web-kit/console"

import { StatusPage } from "@/components/patterns/StatusPage"
import { AppShell } from "@/components/shell/AppShell"
import { requireSession } from "@/features/auth/guards"
import { sessionQuery, useSignOut } from "@/features/auth/queries"
import { getLiveDescriptor } from "@/features/live/repo"
import { LIVE_ROUTES } from "@/features/live/routes"
import { OverviewScreen } from "@/features/overview/OverviewScreen"
import { useAccessEnded } from "@/features/team/useAccessEnded"

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

function AppShellRoute() {
  const { data } = useQuery(sessionQuery)
  const signOut = useSignOut()
  const navigate = useNavigate()

  const identity = data?.status === "signed-in" ? data.identity : null
  // 119: the team record decides (R1). Its role is the shell's once read; a record that has ended signs out (R8).
  const recordRoles = useAccessEnded(identity !== null)

  return (
    <LiveProvider enabled={identity !== null} loadDescriptor={getLiveDescriptor} routes={LIVE_ROUTES}>
      <AppShell
        email={identity?.email ?? ""}
        roles={recordRoles ?? identity?.roles ?? []}
        onSignOut={() => signOut.mutate(undefined, { onSuccess: () => navigate({ to: "/auth/sign-in" }) })}
        signingOut={signOut.isPending}
      >
        <Outlet />
      </AppShell>
    </LiveProvider>
  )
}
