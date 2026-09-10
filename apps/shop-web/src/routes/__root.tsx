import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

import { Toaster } from "@effy/design-system/ui";

import { DevTools } from "@/components/DevTools";

// The router context carries the server-state client so route loads can prime data. Auth is read
// via `context.queryClient.ensureQueryData(sessionQuery)` in the protected `beforeLoad` guard —
// no separate auth object in context.
export interface RouterContext {
  queryClient: QueryClient;
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <>
      <Outlet />
      {/* 057 A3 — every order mutation confirms itself with a toast. Mounted once, at the root. */}
      <Toaster position="bottom-right" />
      {import.meta.env.DEV ? <DevTools /> : null}
    </>
  );
}
