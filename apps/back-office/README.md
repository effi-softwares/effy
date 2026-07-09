# `@effy/back-office` — internal admin console (Vite + React 19 SPA)

The platform's first web surface (spec `005-back-office-web`). Client-only, feature-sliced per
[ARCHITECTURE.md](../../ARCHITECTURE.md) "Operator / admin web (SPA)". **Local-only this slice** —
runs against the live dev `edge-api` + admin Cognito pool; no hosted deploy yet.

## Run

```bash
cp .env.example .env.local     # fill the three VITE_* values (contracts/config.contract.md)
make bo-dev                    # vite dev → http://localhost:5173   (or: pnpm --filter @effy/back-office dev)
make bo-test                   # vitest (component/hook/unit)
make bo-lint                   # tsc --noEmit
make bo-build                  # typecheck + production build
```

Config comes from `.env.local` (git-ignored, non-secret): `VITE_COGNITO_USER_POOL_ID`,
`VITE_COGNITO_CLIENT_ID`, `VITE_API_BASE_URL`. A missing required value fails boot fast, naming it.

## Structure — where every concern lives (and why)

```
src/
├── main.tsx            # entry: assertConfig → Amplify.configure → providers → RouterProvider
├── router.tsx          # the code-based route tree + createRouter(context = { queryClient })
├── routes/             # route definitions
│   ├── __root.tsx      #   providers shell + dev-only unified TanStack DevTools + RouterContext type
│   ├── auth.tsx        #   PUBLIC: /auth/sign-in (captures ?next)
│   └── app.tsx         #   PROTECTED layout: beforeLoad → requireSession; renders the dashboard shell
├── components/layout/  # dashboard shell CHROME (sidebar-07; app shell, NOT a feature slice):
│   ├── AppSidebar.tsx  #   brand mark + NavMain + NavUser (footer)
│   ├── NavMain.tsx     #   primary nav from the role-aware model (nav.ts) — reflects the auth gate
│   ├── NavUser.tsx     #   sidebar-footer menu: verified identity, sign-out, theme toggle
│   ├── AppHeader.tsx   #   inset header: SidebarTrigger + route breadcrumb
│   └── nav.ts          #   the typed nav model + visibleNav(roles) role filter
├── features/<domain>/  # the core unit — one folder per domain:
│   ├── repo.ts         #   API calls via @effy/api-client + DTO↔domain mapping (wire never leaks up)
│   ├── queries.ts      #   server-state hooks (queryOptions/mutations) + query keys
│   ├── model.ts        #   domain types / state machine (optional; may live in shared-types)
│   └── <Screen>.tsx    #   the screen(s)
├── lib/                # app wiring (no DI framework — composed by hand):
│   ├── env.ts          #   VITE_* config + assertConfig (fail-fast)
│   ├── amplify.ts      #   Amplify → existing admin pool
│   ├── auth-session.ts #   access token + cognito:groups from the session
│   ├── api.ts          #   the one ApiClient (baseUrl + token provider)
│   ├── query-client.ts #   the one QueryClient
│   ├── ui-store.ts     #   TanStack Store — GENUINE CLIENT STATE ONLY (theme, palette, hotkeys)
│   ├── telemetry.ts    #   PostHog seam (typed events, no PII beyond subject; no-op if unconfigured)
│   └── utils.ts        #   re-exports cn from @effy/design-system (for shadcn's generated imports)
└── components/ui/      # shadcn components (themed FROM @effy/design-system tokens)
```

**Rules that keep this predictable** (constitution Principle VI):
- **Server-state cache is the source of truth.** Never hand-cache server data in component state.
  Genuine client-only state (theme, command palette, sidebar collapse) goes in `lib/ui-store.ts`,
  nothing else — the dashboard shell drives `SidebarProvider` from `ui-store.sidebarOpen` (controlled),
  never the shadcn block's cookie.
- **Dashboard chrome lives in `components/layout/`, not `features/`.** It is app shell, shared across
  every screen. To add a nav destination: add a `NavItem` to `components/layout/nav.ts` (set
  `requiredRole` to role-gate it — it's filtered by the same predicate as the route guard), then add
  its route. shadcn primitives stay in `components/ui/` and theme from `@effy/design-system`.
- **DTOs are mapped to domain models in `repo.ts`** and never leak past it into screens.
- **The access token** goes to the backend, never the ID token.
- Brand tokens live once in `@effy/design-system` — **never hardcode `#0FB57E`** here.

## Add a screen — walkthrough

1. **Create the feature slice** `src/features/<domain>/`:
   - `repo.ts` — call the backend via `import { api } from "@/lib/api"`; map the DTO (from
     `@effy/shared-types`) to a domain shape.
   - `queries.ts` — wrap the repo call in `queryOptions({ queryKey, queryFn })`; mutations
     invalidate their keys.
   - `<Screen>.tsx` — `useQuery(theQuery)`; render `isPending` / error / success. Surface backend
     failures through the error contract (see below) — never raw detail.
2. **Add the route** in `src/routes/app.tsx` as a child of `appRoute` (protected) — e.g.
   `createRoute({ getParentRoute: () => appRoute, path: "reports", component: ReportsScreen })` —
   and register it in `src/router.tsx`'s `appRoute.addChildren([...])`.
3. **Nav** (if user-facing): add a `<Link to="/reports">` in `AppShell`; gate by role with
   `isAdmin(roles)` (or a role check) for least-privilege UX. The backend remains the
   authoritative gate.
4. `make bo-lint bo-test` green.

## Client error-handling contract

Every backend failure is parsed to a `DomainError` (`@effy/api-client`) with a `kind`
(`unauthenticated | forbidden | not-found | unsupported-version | unavailable | unknown`). Screens
render human-readable states keyed on `kind` — **never** the raw `detail`/stack/token:
- `forbidden` → access-denied · `unavailable` → degraded + retry · `unauthenticated` → session
  recovery / sign-in.
