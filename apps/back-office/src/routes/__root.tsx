import type { QueryClient } from "@tanstack/react-query"
import { Toaster } from "@effy/design-system/ui"
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"

import { DevTools } from "@/components/DevTools"

interface RouterContext {
  queryClient: QueryClient
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <Outlet />
      {/* Every toast plays its tone (operator 2026-11-13, 120 FR-020); top centre like the shop console. */}
      <Toaster position="top-center" sound="on" />
      {import.meta.env.DEV ? <DevTools /> : null}
    </>
  )
}
