import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"

import { DevTools } from "@/components/DevTools"
import { ShopToaster } from "@/components/console/ShopToaster"
import { useNotificationNavigation } from "@/features/notifications/useNotificationNavigation"

interface RouterContext {
  queryClient: QueryClient
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  // Mounted here, not in the app shell, so a notification click that arrives on the sign-in page is not lost (109).
  useNotificationNavigation()
  return (
    <>
      <Outlet />
      <ShopToaster />
      {import.meta.env.DEV ? <DevTools /> : null}
    </>
  )
}
