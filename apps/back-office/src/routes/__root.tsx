import type { QueryClient } from "@tanstack/react-query";
import { Toaster } from "@effy/design-system/ui";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

import { DevTools } from "@/components/DevTools";

// The router context carries the server-state client so route loads can prime data
// (ARCHITECTURE admin-web). Auth is read via `context.queryClient.ensureQueryData(sessionQuery)`
// in protected `beforeLoad` guards (US1) — no separate auth object needed in context.
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
      {/* 073 — every action ends with one line saying what happened. */}
      <Toaster position="bottom-right" />
      {import.meta.env.DEV ? <DevTools /> : null}
    </>
  );
}
