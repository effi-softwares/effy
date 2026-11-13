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
      {/* Silent, except toasts that ask - the scan box (120 FR-020). */}
      <Toaster position="bottom-right" sound="opt-in" />
      {import.meta.env.DEV ? <DevTools /> : null}
    </>
  )
}
