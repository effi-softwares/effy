# `@effy/shop-web` — the shop operator console

The web half of the **shop** audience. A Vite + React 19 SPA on the **shop** Cognito pool,
talking to the cold-path **shop** service. **Local-only** this slice — there is no hosted deploy.

Spec: [specs/007-shop-web](../../specs/007-shop-web/). Its sibling surface is
[`apps/shop-mobile`](../shop-mobile/), and the two are held at parity by
[docs/audiences/shop-capabilities.md](../../docs/audiences/shop-capabilities.md).

> **Naming, once**: it is `shop` everywhere — the surfaces, the pool, the gateway authorizer, the
> backend service, its route paths, its tables, its roles, and the audience in prose. The earlier
> `shop`/`store` split was retired by 008-shop-naming-unification; `make verify-naming` enforces it.

## Run it locally (target: signed in within 15 minutes of a fresh clone)

```bash
pnpm install
cp apps/shop-web/.env.example apps/shop-web/.env.local   # then fill it in, see below
make shop-dev                                            # http://localhost:5174
```

Fill `.env.local` from the SSM contract (all non-secret, all build-time):

| Variable | `aws ssm get-parameter --name …` |
|---|---|
| `VITE_COGNITO_USER_POOL_ID` | `/effy/dev/auth/shop/user_pool_id` |
| `VITE_COGNITO_CLIENT_ID` | `/effy/dev/auth/shop/app_client_id` |
| `VITE_API_BASE_URL` | `/effy/dev/edge/api_endpoint` |

A missing value fails at boot with a configuration-error page rather than a white screen. Note the
SSM slug is the un-hyphenated `shop`, unlike back-office's `back-office`.

**The port is not arbitrary.** `5174` is an *approved CORS origin* on the shared gateway
(`infra/envs/dev/edge-gateway.tf`). `strictPort` is on, because a silent bump to `5175` would make
every API call fail CORS with an error that looks nothing like its cause.

You need a provisioned shop-pool account — there is **no self sign-up**. See
[quickstart.md](../../specs/007-shop-web/quickstart.md) §3.

```bash
make shop-lint    # tsc --noEmit
make shop-test    # vitest
make shop-build   # production build
```

## Structure — where every concern lives, and why

```
src/
├── main.tsx            composition root: assertConfig → Amplify → telemetry → theme → render.
│                       Wired by hand, top-down. No DI framework (Principle VI).
├── router.tsx          the code-based route tree
├── styles.css          imports the shared tokens. Defines NO theme of its own (guarded by a test).
├── routes/
│   ├── __root.tsx      router context (the server-state client)
│   ├── auth.tsx        public: /auth/sign-in
│   └── app.tsx         protected: beforeLoad guard + <ConsoleShell> + the screens
├── lib/                thin wiring over @effy/web-kit: env, api, telemetry, ui-store
├── components/layout/
│   └── nav.ts          THIS surface's nav config (which items, which role each needs)
└── features/<domain>/  the unit of work:
    ├── repo.ts         calls the API, maps DTO → domain. Nothing wire-shaped escapes it.
    ├── queries.ts      queryOptions + keys. The server-state cache is the source of truth.
    └── <Screen>.tsx    renders states. Never calls `api` directly, never shows a raw error.
```

Almost nothing here is novel. The runtime (config, Amplify, the EMAIL_OTP flow, the session guard,
the query client, telemetry, the client store) and the console chrome (shell, sidebar, header, user
menu, sign-in card, error state) live in **[`@effy/web-kit`](../../packages/web-kit/)**; the shadcn
primitives live in **`@effy/design-system/ui`**. This app supplies its brand, its nav, its role
union, its feature slices, and its analytics taxonomy — nothing else.

**Rule of thumb**: if you are about to copy a file from `apps/back-office`, it belongs in a package
instead, parameterized. Copy-paste of cross-cutting logic across surfaces is prohibited
(constitution Principle II), and `make shop-test` is not what catches it — review is.

## Client error-handling contract

Every backend failure arrives as a `DomainError` from `@effy/api-client` (RFC 9457 problem+json →
`kind`). Screens render a human state keyed on `kind` — **never** the raw `detail`, a status code, a
stack trace, or a token.

| `kind` | Rendered as | Recovery |
|---|---|---|
| `unauthenticated` | "Your session has expired." | recover session, else sign-in |
| `forbidden` | access-denied state; **no privileged data** | none — a denial is a correct answer |
| `unavailable` | degraded state (the backend may be waking) | **Retry** |
| `not-found` | not-found state | back to dashboard |
| `unknown` | generic failure | Retry |

`createQueryClient` never retries `forbidden` / `unauthenticated` / `not-found`. Cold starts are an
expected state, not a bug.

Two states are **not** errors and must never read as one: a **role-less** operator (recorded, granted
nothing) and an operator with **no assigned shop** (expected — the record is created on first
sign-in, before their shop is known).

## Role-aware interface, and what actually guards it

`nav.ts` hides the Management item from anyone without `shop_manager`. That is least-privilege UX
and defense in depth — **it is not the guard**. The backend decides independently, from the
platform's own record, using three terms:

```
role = shop_manager   AND   staff.status = 'active'   AND   shop.is_active (⇒ a shop is assigned)
```

A `shop_staff` operator who types `/manager` into the address bar reaches the screen and is refused
by `GET /shop/v1/manager-ping` with a uniform `403` that does not say *which* term failed. Hiding a
link is a courtesy; the refusal is the security boundary.

## Add a screen — walkthrough

1. Create `src/features/<domain>/` with `repo.ts` (call `api`, map DTO → domain), `queries.ts`
   (`queryOptions` + a key under a stable prefix), and `<Screen>.tsx` (render states via
   `<ErrorState>`, never a raw error).
2. Add the route in `src/routes/app.tsx` as a child of `appRoute`; register it in `src/router.tsx`.
3. Add a `NAV` entry in `src/components/layout/nav.ts`. If it is privileged, set `requiredRole`
   **and add the matching backend gate**. A hidden nav item is not a gate.
4. **Update the parity register**
   ([docs/audiences/shop-capabilities.md](../../docs/audiences/shop-capabilities.md)): a
   capability added here must record its state on `shop-mobile`. This step is not optional — an
   unstated cell is a defect.
5. `make shop-lint shop-test`.

## Theme

This surface defines **no theme of its own**. Brand, dark mode, and neutral surfaces with a single
jade accent all come from `@effy/design-system` (`tokens.css`). Sizing is the shadcn/Tailwind
default (16px root, no fluid scaling). `src/theme-tokens.test.ts` fails the build if a colour
literal, a `@theme` block, or a local `font-size: clamp()` appears in `styles.css`.
