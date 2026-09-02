import { createRoute, Outlet } from "@tanstack/react-router";

import { SignInScreen } from "@/features/auth/SignInScreen";

import { rootRoute } from "./__root";

export const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  component: () => (
    <div className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="w-full max-w-sm space-y-7">
        {/* 057 — the mockup's brand lockup above the form. Adopted; see SignInScreen for the one
            thing on that screen that was NOT adopted. */}
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md text-[13px] font-semibold"
          >
            E
          </span>
          <span className="text-sm font-semibold tracking-tight">Effy Shop Console</span>
        </div>
        <Outlet />
      </div>
    </div>
  ),
});

export const signInRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "sign-in",
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  component: SignInRouteComponent,
});

function SignInRouteComponent() {
  const { next } = signInRoute.useSearch();
  return <SignInScreen next={next} />;
}
