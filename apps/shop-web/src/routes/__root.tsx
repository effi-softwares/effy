import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"

import { Toaster } from "@effy/design-system/ui"

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
      <Toaster position="bottom-right" />
      {import.meta.env.DEV ? <DevTools /> : null}
    </>
  )
}
