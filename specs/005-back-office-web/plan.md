# Implementation Plan: Back-Office Web Foundation (Bootstrap)

**Branch**: `005-back-office-web` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-back-office-web/spec.md`, binding
[operator-directives.md](./operator-directives.md), [research.md](./research.md) (Phase 0),
constitution **v1.4.0**, [ARCHITECTURE.md](../../ARCHITECTURE.md) (binding — the
"Operator / admin web (SPA)" section governs this feature).

> **Amendment D1 (2026-07-08)** — *default dashboard shell.* Spec adds **FR-023 / US1 / SC-013**:
> the authenticated shell graduates from the bootstrap top-header frame to a **standard dashboard
> layout** (persistent collapsible sidebar + inset header/breadcrumb + content region), sourced
> from the shadcn **`sidebar-07`** block (operator directive). **Presentation-only** — zero
> backend / data / auth change. Design + structure delta in [§ Amendment D1](#amendment-d1--default-dashboard-shell-us1--fr-023-presentation-only)
> and research [Part G](./research.md#part-g); mechanic **4** below. Constitution re-check: **PASS**
> (unchanged gates — shell is app chrome; brand tokens stay the design-system SSOT).

> **Amendment D2 (2026-07-09)** — *neutral theme + responsive scaling.* Spec adds **FR-024 /
> FR-025 / SC-014 / SC-015**: **(1)** neutralise the design-system surfaces (drop the jade-tinted
> `--accent`/`--sidebar*`/`--secondary`/`--muted`/`--border` blends) — surfaces become neutral,
> **Jade `#0FB57E` stays the single accent** (primary/ring/brand mark); **(2)** add **fluid
> root-font-size scaling** so the whole rem-based UI grows proportionally on wide displays.
> Both live in **`@effy/design-system` (the SSOT)** → every surface inherits them.
> **Presentation-only** — zero backend / data / auth change. Design in
> [§ Amendment D2](#amendment-d2--neutral-theme--responsive-scaling-fr-024fr-025-presentation-only),
> research [Part H](./research.md#part-h) (theme) + [Part I](./research.md#part-i) (scaling).
> Constitution re-check: **PASS — no amendment needed** (Jade `#0FB57E` is an emerald shade and is
> retained as the brand accent; only surface *tinting* is removed — see Amendment D2 § Governance).

## Summary

Bootstrap the platform's **first web surface** — the internal `back-office` admin console — as a
production-shaped, feature-sliced React SPA, plus the **first shared web packages** every future
web surface will inherit. Deliverable is a *foundation*, not product features (there is no
product data to administer yet):

- **`apps/back-office`** — Vite + React 19 + TypeScript SPA, client-only (all auth in the
  browser), feature-sliced per ARCHITECTURE admin-web: `src/features/<domain>/{repo,queries,
  model,Screen}` → `src/lib/` (authed fetch wrapper, auth config, query client) →
  `src/components/ui/` (shadcn). **TanStack client spine** (Router code-based tree +
  `beforeLoad` auth guard, Query as the server-state SSOT, Table, Form, unified DevTools;
  Virtual + `@tanstack/react-hotkeys` (alpha, operator-chosen) wired-as-foundation), **shadcn/ui**
  (Radix base, Tailwind v4, preset `b2BnwlLOK`), **AWS Amplify v6** passwordless **EMAIL_OTP**
  against the existing 001 **admin** pool. Client state via **TanStack Shop** (constitution
  v1.4.0 — Zustand removed). Proving surfaces: passwordless sign-in → console shell → a
  identity proving read (the existing `/admin/v1/ping` at P2, **graduating** to the
  record-backed `/admin/v1/me` at US4) → an **admin-only** read
  (`/admin/v1/admin-ping`) whose authorization is role-claim-based at US3 and **upgraded to
  the DB record (status+role) at US4**. Built as an MVP ladder (each story independently
  testable). **Runs locally only** this slice (hosted deploy deferred).
- **`packages/design-system`** (Jade `#0FB57E`/`#047857` tokens + Tailwind v4 theme + dark mode
  + `cn` — the brand SSOT, Principle V), **`packages/shared-types`** (DTO + error-envelope types,
  the contract SSOT, Principle II), **`packages/api-client`** (authed fetch wrapper + RFC 9457
  error mapping) — the first shared web foundation (FR-010), populated with only what US1–US5
  need.
- **`apis/edge-api/admin` + `db/migrations`** — the back-office **staff/RBAC data layer**: a new
  migration adding the **`admin.staff` / `admin.role` / `admin.staff_role`** tables (003
  workflow — the first real tables + first `db-up`); a `staff` domain (raw-SQL repository +
  service) that **JIT-upserts** the staff record on first contact and reconciles roles; a new
  `GET /admin/v1/me` (records + returns the platform record); and `GET /admin/v1/admin-ping`
  (admin group only) authorizing from the **DB record — status + role** (FR-020), so a `disabled`
  staff row is refused despite a valid token. Plus the per-route alarms; the `localhost:5173` dev
  CORS origin is a **Terraform gateway** value (`infra/envs/dev/edge-gateway.tf`, A3), already live.
  (Spec Clarification Option B + the persistence clarification / FR-018–022.)

All technology choices trace to Phase 0 [research.md](./research.md) (four internet passes +
one in-repo dependency verification). Pins are in research Part A; the largest execution risk
(admin-pool auth-flow config) is **verified already satisfied** in 001 (research C4).

## Technical Context

**Language/Version**:
- `apps/back-office`: TypeScript **5.9.x**, React **19.x**, Vite **7.x** (`@vitejs/plugin-react`).
- `apis/edge-api/admin` delta: TypeScript on `nodejs22.x`/arm64 (unchanged from 004).

**Primary Dependencies** (confirm-at-install pins — research A1/A2, C1):
- Client spine: `@tanstack/react-router` 1.170.17 · `@tanstack/react-query` 5.101.2 ·
  `@tanstack/react-table` 8.21.3 · `@tanstack/react-form` 1.33.0 · `@tanstack/react-devtools`
  0.10.8 (+ `@tanstack/react-query-devtools`, `@tanstack/react-router-devtools` panels).
- Client state: `@tanstack/react-store` 0.11.0 (genuine client state only — **now the locked
  standard**, constitution v1.4.0; Zustand removed).
- Foundation, deferred first use: `@tanstack/react-virtual` 3.14.5 · `@tanstack/react-hotkeys`
  0.10.0 (**alpha, operator-chosen** — pinned + isolated behind a `lib/` wrapper).
- UI: `shadcn` CLI v4 (Radix base) · Tailwind **v4** (`@tailwindcss/vite`) · preset `b2BnwlLOK`.
- Auth: `aws-amplify` **^6.18** (manual `Amplify.configure`, no backend project).
- edge-api delta: no new npm deps — reuses `pg`/`pino`/`lib` (raw SQL against the new `admin`
  tables).
- **Not adopted this slice**: `@tanstack/react-db` (beta — operator-dropped, research A3).

**Storage**: The **client** owns none — all server state lives in the TanStack Query cache
(source of truth, Principle VI); the browser holds only the Amplify auth session (its own token
storage) and a tiny TanStack Store for theme/UI. **New platform storage**: the back-office
**`admin.staff` / `admin.role` / `admin.staff_role`** tables in the 002 dev DB (PostgreSQL 16),
raw SQL, no ORM, reached **only** through `edge-api` (never from the web tier). Introduced via
the 003 Goose forward-only workflow. No `public` (customer-operational) data touched.

**Testing**: Vitest + React Testing Library — auth state machine, protected-route guard,
role-gate rendering (admin vs manager/csa vs role-less), error-contract mapping, DTO↔domain
mappers. edge-api: `staff` service/repository tests (JIT upsert idempotency, role reconcile,
status-based denial) against local Postgres (existing testcontainers pattern); handler tests
(`/me` records+returns; `/admin/v1/admin-ping` admin-served / manager+csa+**disabled** refused). Full
live sign-in→record→refusal flow is an **operator-run** quickstart pass (real OTP email + live
edge-api + `db-up`), not CI (research E3).

**Target Platform**: modern evergreen browsers; the console runs on the developer's machine
(`vite dev`, `http://localhost:5173`) against the **live dev** edge-api + admin Cognito pool.
No hosted deployment this slice (spec assumption; hosted Amplify Hosting deferred).

**Project Type**: web SPA (first `apps/*` web surface) + first `packages/*` shared web packages +
a one-route delta to an existing service. Activates the `apps/*` and `packages/*` workspace globs.

**Performance Goals**: not a latency-critical surface (that is the hot path's job); target a
snappy dev feel and a legible first paint. The measurable bars are UX/flow SCs (sign-in < 2 min,
graceful degraded states), not throughput.

**Constraints**: client-only (no SSR — ARCHITECTURE admin-web); server-state cache is the SSOT,
**no server data hand-cached in component state** (Principle VI); no DI framework (explicit
wiring — the router context carries the query client + auth; `src/lib` composes the fetch
wrapper by hand); DTOs mapped to domain models in each feature's `repo.ts`, never leaked to
screens; **access** token to the backend (never the ID token); no secret in the bundle or repo;
dark mode required; no PII in telemetry beyond the auth subject id.

**Scale/Scope**: bootstrap slice — sign-in flow, protected app shell, two proving screens
(staff-identity + admin-only), role-aware nav, three shared packages (minimally populated), the
back-office **staff/RBAC data layer** (3 tables + a migration + a `staff` domain), two new
backend routes (`/me`, `/admin/v1/admin-ping`). No **product** features, no hosted deploy, no TanStack DB,
no event backbone. (This is larger than a pure web bootstrap — it now includes the first real
`admin`-schema data layer, per the operator's persistence decision.)

## Constitution Check

*GATE: evaluated pre-Phase-0 and re-checked post-design — **PASS.** The client-stack deviations
flagged at first draft were **ratified by the operator in constitution v1.4.0** (2026-07-08); the
only remaining Complexity-Tracking entries are one accepted-risk (alpha Hotkeys) and one
constitution-aligned scope note (the admin-schema data layer).*

| Principle | Verdict | Evidence |
|---|---|---|
| **I. Spec-driven** | PASS | spec.md (tech-free) → clarify (Option B backend gate) → this plan (cites constitution + research) → tasks next. Premise refinements found in research (TanStack DB premature; Hotkeys alpha; Store vs Zustand) are surfaced **here**, not silently coded (mirrors 004's serverless-version/Node correction discipline). |
| **II. Monorepo & shared contracts** | PASS | First `apps/*` + `packages/*` members. Shared **design-system** (brand tokens SSOT), **shared-types** (DTO + error-envelope types typed from `docs/api/` — never hand-redefined per surface), **api-client** (one authed fetch wrapper). Web DTO types trace to the same `docs/api/` contracts edge-api implements. Component-sharing follows a documented graduation rule (research B3) — no copy-paste. |
| **III. Dual-path discipline** | PASS | The console is a **cold-path** client of `edge-api` (ops/back-office audience — correct path per the FR-014 rule). The backend additions (`/me`, `/admin/v1/admin-ping`, the `staff` data layer) are latency-tolerant, low-frequency ops work → cold path. The staff/RBAC tables live in the DB's `admin` schema (back-office accounts + audit — its constitutional purpose), reached only via the cold path. No hot-path traffic introduced. |
| **IV. Auth isolation** | PASS | Amplify authenticates **only** against the **admin** pool (001); the app holds one audience's tokens and presents the **access** token solely to edge-api's back-office authorizer. A token for another pool is structurally unusable here (wrong client_id/issuer) and edge-api rejects it. No auth proxy. Admin-provisioned, no self-sign-up (pool has no sign-up config). |
| **V. Design system** | PASS | Jade `#0FB57E`/`#047857` + dark-mode live once in `packages/design-system` and are consumed, not hardcoded (FR-011). The shadcn preset must not override the brand (research B2). The minimal TanStack Store for genuine client state (theme/command-palette/hotkey scope) is now **the standard** (constitution v1.4.0; ARCHITECTURE admin-web wording softened accordingly) — no longer a deviation. |
| **VI. Layered architecture & explicit wiring** | PASS | *Web*: feature-sliced exactly per ARCHITECTURE admin-web: `features/<domain>/{repo.ts (API + DTO↔domain), queries.ts, model.ts, <Screen>.tsx}`; `lib/`; `components/ui/`; router = programmatic tree; protected `beforeLoad` guards the session; server-state cache only for server data; no DI framework. *edge-api*: gains its **first real repository with writes** — `staff/repository.ts` raw-SQL upsert + role reconcile + status/role read (no ORM/query builder), rows mapped explicitly to domain models, never leaked past the data layer; `staff/service.ts` owns the JIT logic; handlers stay thin (Principle VI three-layer slice). |
| **VII. Observability & telemetry** | PASS — declaration below | |

**Telemetry declaration (Principle VII)** — this slice adds a user-facing flow, so it must declare:
- **Product analytics (PostHog)**: a **typed event taxonomy seam** in `api-client`/`lib`; the one
  instrumentable flow this slice has is authentication — events `auth_sign_in_started`,
  `auth_otp_submitted`, `auth_sign_in_succeeded`, `auth_sign_in_failed{reason}`,
  `auth_signed_out`, plus `admin_area_access_denied` (role gate). **No PII** beyond the auth
  subject id; consent-respecting. Full dashboards arrive with the observability infra slice — the
  typed taxonomy + wiring exist now so future screens extend it, never re-invent it.
- **Web error tracking (PostHog)**: runtime/render errors routed to PostHog via an error
  boundary + a global handler in `lib/`; no secret/token/PII in payloads.
- **Backend (edge-api delta)**: the new `/me` + `/admin/v1/admin-ping` handlers inherit the existing pino
  one-record-per-invocation logging; each new function gets its 3 CloudWatch alarms (research
  D1). The staff record's **email is account data stored in the DB — it is never logged or
  telemetried**; log lines and analytics stay **subject-only** (Principle VII). No new metrics
  surface.
- The PostHog *keys/config* are per-environment `VITE_*` (non-secret project keys); wiring is
  behind a thin provider so a missing key degrades to no-op, never a crash.

## Project Structure

### Documentation (this feature)

```text
specs/005-back-office-web/
├── spec.md                  # WHAT/WHY (done) + Clarifications (Option B + persistence)
├── operator-directives.md   # binding tech mandate (done)
├── plan.md                  # this file
├── research.md              # Phase 0 (done) — decisions A*/B*/C*/D*/E* cited here
├── data-model.md            # Phase 1 — client domain models, auth state machine, config, DTOs
├── quickstart.md            # Phase 1 — developer run + operator validation runbook
├── contracts/               # Phase 1
│   ├── back-office-web.contract.md   # what the console consumes + token/error handling
│   ├── staff-schema.contract.md      # admin.staff/role/staff_role tables (FR-019/021)
│   ├── back-office-me.contract.md    # GET /admin/v1/me — record + return (FR-005/019)
│   ├── admin-ping.contract.md        # GET /admin/v1/admin-ping — DB-record authz (FR-018/020)
│   └── config.contract.md            # the VITE_* per-env env contract
└── tasks.md                 # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
apps/back-office/                       # Vite + React 19 SPA (first web surface)
├── index.html
├── vite.config.ts                      # @vitejs/plugin-react + @tailwindcss/vite
├── components.json                     # shadcn config (Radix base; aliases → design-system)
├── src/
│   ├── main.tsx                        # entry: Amplify.configure → providers → RouterProvider
│   ├── router.tsx                      # programmatic route tree + createRouter(context={queryClient,auth})
│   ├── routes/                         # route definitions (code-based)
│   │   ├── __root.tsx                  # root: providers, devtools, error boundary
│   │   ├── auth.tsx                    # public auth layout (sign-in / verify OTP)
│   │   └── app.tsx                     # PROTECTED layout: beforeLoad → ensure session or redirect;
│   │                                   #   renders the dashboard shell (SidebarProvider→AppSidebar+SidebarInset→Outlet) — FR-023
│   ├── components/layout/              # dashboard shell chrome (sidebar-07 block, themed FROM design-system) — FR-023
│   │   ├── AppSidebar.tsx              # brand header + role-aware NavMain + NavUser (identity/sign-out/theme)
│   │   ├── NavMain.tsx                 # primary nav from a role-filtered nav model (isAdmin/requireGroup)
│   │   ├── NavUser.tsx                 # sidebar-footer user menu: verified identity, sign-out, theme toggle
│   │   └── AppHeader.tsx               # SidebarInset header: SidebarTrigger + route breadcrumb
│   ├── features/
│   │   ├── auth/                       # the session feature (US1)
│   │   │   ├── repo.ts                 # Amplify calls: signIn/confirmSignIn/signOut/fetchAuthSession
│   │   │   ├── queries.ts              # session-as-a-query + sign-in/out mutations
│   │   │   ├── model.ts                # SessionState machine + Identity/roles domain types
│   │   │   ├── SignInScreen.tsx        # email → OTP (TanStack Form)
│   │   │   └── guards.ts               # requireSession / requireGroup(...) for beforeLoad
│   │   └── staff-identity/             # the proving feature (US2 + US3 + US4 read side)
│   │       ├── repo.ts                 # GET /admin/v1/ping→/me (US2→US4) + /admin/v1/admin-ping (DTO↔domain)
│   │       ├── queries.ts              # server-state hooks + keys
│   │       ├── model.ts                # StaffRecord / AdminPingResult domain types
│   │       ├── MeScreen.tsx            # staff-identity read: platform record (identity + roles + status)
│   │       └── AdminOnlyScreen.tsx     # admin-only read; role-gated nav + backend-refusal surface
│   ├── lib/
│   │   ├── amplify.ts                  # Amplify config from VITE_* (existing admin pool)
│   │   ├── query-client.ts             # the one QueryClient (into router context)
│   │   ├── auth-session.ts             # fetchAuthSession → access token + cognito:groups
│   │   ├── telemetry.ts                # PostHog provider + typed event taxonomy + error routing
│   │   └── ui-store.ts                 # TanStack Store: theme / command-palette / hotkey scope ONLY
│   └── components/ui/                  # shadcn primitives (themed FROM design-system tokens):
│                                       #   button/card/input/label + sidebar-07 deps: sidebar, sheet,
│                                       #   separator, tooltip, skeleton, breadcrumb, dropdown-menu,
│                                       #   avatar, collapsible, + hooks/use-mobile (FR-023)
├── .env.example                        # VITE_* names only, no values
├── package.json / tsconfig.json / vitest.config.ts
└── README.md                           # structure guide + add-a-screen walkthrough + conventions

packages/design-system/                 # brand SSOT (Principle V) — FIRST shared web package
├── src/tokens.css                      # Tailwind v4 @theme: Jade #0FB57E / fill #047857, dark mode
├── src/cn.ts                           # class-merge util
├── src/index.ts
└── package.json / README.md            # + component graduation rule (research B3)

packages/shared-types/                  # DTO + error-envelope types (Principle II SSOT)
├── src/problem.ts                      # RFC 9457 problem+json type (mirrors docs/api/error-envelope.md)
├── src/back-office.ts                  # me / admin-ping response DTO types (StaffRecord, AdminPingResult)
├── src/index.ts
└── package.json

packages/api-client/                    # one authed fetch wrapper + error mapping
├── src/client.ts                       # fetch wrapper: inject Bearer access token, parse problem+json
├── src/errors.ts                       # DomainError mapping from the shared error contract
├── src/index.ts
└── package.json

# db/migrations delta (003 workflow — FR-021)
db/migrations/<ts>_back_office_staff_rbac.sql   # admin.staff / admin.role (seed) / admin.staff_role

# apis/edge-api/admin delta (FR-018–022)
apis/edge-api/admin/src/staff/repository.ts        # raw SQL: upsert-on-conflict, role reconcile, status/role read
apis/edge-api/admin/src/staff/service.ts           # JIT provisioning + authorize(status active AND role)
apis/edge-api/admin/src/staff/types.ts             # StaffRecord domain type + row mappers
apis/edge-api/admin/src/staff/repository.test.ts    # upsert idempotency, reconcile, disabled-denial (testcontainers)
apis/edge-api/admin/src/functions/back-office-me-v1-get.ts          # records + returns the platform staff record
apis/edge-api/admin/src/functions/back-office-admin-ping-v1-get.ts  # admin gate → authorizes from DB (status+role)
apis/edge-api/admin/src/functions/back-office-*.test.ts             # /me + /admin/v1/admin-ping handler tests
apis/edge-api/admin/serverless.yml        # + backOfficeMeV1 & backOfficeAdminPingV1 fns + alarms + localhost:5173 CORS
docs/api/                               # + notes for /admin/v1/me and /admin/v1/admin-ping

# Repo root deltas
pnpm-workspace.yaml                     # activate globs: apps/*, packages/*
turbo.json                             # + dev/build/lint/typecheck/test for the new members
Makefile                               # + bo-dev / bo-build / bo-lint / bo-test (back-office)
package.json                           # workspace scripts if needed
```

**Structure Decision**: `apps/back-office` is the first `apps/*` web surface; `packages/design-
system|shared-types|api-client` are the first `packages/*` shared web packages, created now
because spec FR-010/US5 mandate the shared foundation this slice (unlike 004's defer-to-2nd-
consumer lib rule — research E2). The console is feature-sliced exactly per ARCHITECTURE
admin-web (§314-341); the edge-api change reuses that service's existing conventions and lands
in place.

## The three non-obvious mechanics

**1 — Session as a query + `beforeLoad` guard (US1, ARCHITECTURE admin-web).** The Amplify
session is modeled as a **TanStack Query** (`queries.ts` `sessionQuery`), *not* a client store —
so the whole app reads one cached source of truth for "who am I / am I signed in." The protected
route layout's `beforeLoad` calls `context.queryClient.ensureQueryData(sessionQuery)`; if there
is no valid session it `throw redirect({ to: '/auth/sign-in', search: { next: location.href } })`.
Sign-in/out are **mutations** that invalidate the session query. The `SessionState` domain type
is a discriminated union (`checking | signed-out | otp-pending | signed-in{identity,roles} |
error`) — the unidirectional state machine Principle VI wants, expressed in server-cache terms.

**2 — Backend-authoritative role gating (US3 / FR-006a, the Option-B mechanic).** Role-awareness
is defense in depth, never interface-only:
- *Interface layer*: `requireGroup('admin')` in the admin route's `beforeLoad` hides/blocks the
  admin-only area for manager/csa; nav renders per `roles` from the token claim.
- *Authoritative layer*: the admin-only **screen actually calls** `GET /admin/v1/admin-ping`.
  The **backend** decides — not the hidden button: at **US3 (P3)** by the role claim
  (`hasAnyGroup('admin')`), then **upgraded at US4 (P4)** to the DB record (status `active` AND
  role `admin` — mechanic 3). For an admin it serves; for manager/csa (or, post-US4, a `disabled`
  admin) it returns the shared `forbidden`, which the console surfaces (SC-004/SC-012). The proof
  is the backend's 403 — independently testable at P3 and hardened at P4.

**3 — JIT staff provisioning + DB-record authorization (US4 / FR-019–022, the "not solely
Cognito" mechanic).** The backend never sees sign-in (Amplify ↔ Cognito directly), so it meets a
staff member on their **first authenticated call**: `GET /admin/v1/me` runs an **idempotent
upsert** — `INSERT ... ON CONFLICT (cognito_sub) DO UPDATE ...` — creating/refreshing the
`admin.staff` row and reconciling `admin.staff_role` from the token's `cognito:groups`, then
returns the platform record. Concurrent first contact yields exactly one row (the unique
`cognito_sub` + `ON CONFLICT` is the idempotency guarantee — same discipline as 004's idempotent
consumer). Authorization for the admin gate then reads **status + role from the DB**, so setting a
row `status='disabled'` denies a valid-token admin (SC-012) — the concrete independence from
Cognito. Roles are Cognito-seeded this slice; DB-authoritative role *management* is a later slice.
(`GET /me`'s idempotent last-seen write-on-read is a deliberate, documented choice — research F4.)

**4 — Default dashboard shell = protected layout, not a feature (US1 / FR-023).** The dashboard
chrome is **app shell**, not a feature slice: it lives in `routes/app.tsx` + `components/layout/`,
wraps the same `<Outlet/>` every proving screen already renders into, and adds **zero** new data
path. `SidebarProvider → AppSidebar → SidebarInset` replaces the old top-header frame. It **reuses
existing state**, not new state: `NavUser` reads the same `sessionQuery` identity + `useSignOut`
mutation + `uiStore` theme that today's header uses; `NavMain` filters items by the **same**
`isAdmin(roles)`/`requireGroup` role logic that already gates the admin route (mechanic 2) — so
role-aware nav is a *reflection* of the authoritative gate, never a second source of truth. The
sidebar's collapsed/expanded bit is genuine client UI state → it belongs in the TanStack Store
`uiStore` (Principle V/VI), alongside theme. See [Amendment D1](#amendment-d1--default-dashboard-shell-us1--fr-023-presentation-only).

## Amendment D1 — Default dashboard shell (US1 / FR-023, presentation-only)

**Trigger**: operator directive (2026-07-08, recorded verbatim in [operator-directives.md](./operator-directives.md)) —
"when we bootstrap the application we need to have default dashboard layout … follow the shadcn
**`sidebar-07`** block … install it and use it or … copy the code." Spec updated: new Clarifications
entry, expanded US1 + AS-6, **FR-023**, **SC-013**, **Dashboard Shell** entity.

**Scope boundary**: **presentation/foundation only.** No change to the backend (`/me`, `/admin/v1/admin-ping`,
the `staff` data layer), the migration, auth, the config contract, or any DTO/domain type. The two
proving screens (US2/US3) are unchanged — they simply render **inside** the new shell instead of the
old header frame. So Constitution Check, Technical Context, and all other artifacts hold as-is; only
the app-shell presentation delta below is new.

**Acquisition (operator's choice, per directive) — research [Part G](./research.md#part-g)**:
- **Install** (default): `pnpm dlx shadcn@latest add sidebar-07` — resolves through the pinned
  preset `b2BnwlLOK` / Radix base / the app's `components.json`. Pulls the `sidebar` primitive **and
  its dependency components** into `apps/back-office/src/components/ui/` (sidebar, sheet, separator,
  tooltip, skeleton, breadcrumb, dropdown-menu, avatar, collapsible) + the `use-mobile` hook, and
  the block's composed parts (app-sidebar / nav-main / nav-user / team-switcher / breadcrumb header).
- **Or copy** the block source from ui.shadcn.com/blocks#sidebar-07 into the same paths (identical
  result; use if the CLI add fights the monorepo).
- Either way this is shadcn's **"components copied per app"** model — exactly research **B3**. The
  copied primitives are **themed *from* `packages/design-system` tokens** (Jade + dark mode); no
  brand value is hardcoded and none of the block's default palette overrides the design-system SSOT
  (Principle V). The block's supplied nav/user data is **replaced** with real console state (below).

**Adaptation to Effy conventions** (the block ships demo data + a flat `components/` dump; we make it
conform):
- The block's composed pieces are renamed/moved to `src/components/layout/` (`AppSidebar`, `NavMain`,
  `NavUser`, `AppHeader`) — **app chrome**, not a `features/<domain>` slice; the shadcn **primitives**
  stay in `components/ui/`. `routes/app.tsx`'s `AppShell` becomes the `SidebarProvider → AppSidebar +
  SidebarInset(AppHeader + main>Outlet)` composition; `DashboardScreen` (the index-route content) is
  unchanged and renders in the content region.
- **Brand header**: the block's "team switcher" is reduced to a single **Effy Back-Office** brand mark
  (single-brand platform — there is no team/org switcher concept; CLAUDE.md). No fake teams.
- **NavMain (role-aware, FR-006/FR-023)**: nav items come from a small typed **nav model** (label,
  route, optional `requiredRole`); the list is filtered by the **existing** `isAdmin(roles)` /
  `requireGroup` logic (mechanic 2) so a manager/csa/role-less account never sees the Admin item —
  a reflection of the backend gate, not a replacement. Demo "projects"/secondary nav is dropped
  (nothing to show in a bootstrap).
- **NavUser (sidebar footer)**: shows the verified **identity** (email/subject from `sessionQuery`),
  and its menu carries **Sign out** (`useSignOut` → redirect to `/auth/sign-in`) and the **theme
  toggle** (`toggleTheme`/`uiStore`) — the actions the old header held, relocated, same wiring.
- **AppHeader**: `SidebarTrigger` (collapse/expand) + a **breadcrumb** derived from the active route
  (Dashboard / Admin) via the router — replaces the old inline `<nav>` links.
- **Collapse state**: the sidebar open/collapsed bit is genuine client-only UI state → held in the
  TanStack Store `uiStore` (Principle V/VI), persisted like theme; `SidebarProvider` is driven from it.

**Testing delta** (Vitest + RTL, extends E3 — no new backend tests): the dashboard shell renders the
sidebar + inset header + content `Outlet`; **role-aware NavMain** shows the Admin item for an admin
and hides it for manager/csa/role-less (reuses the existing role-gate test fixtures); the NavUser menu
exposes sign-out + theme toggle wired to the existing mutation/store; collapse/expand toggles the
`uiStore` bit. The full visual/dark-mode pass stays an operator quickstart step (SC-013).

**Structure delta** (added to the source tree above): `src/components/layout/{AppSidebar,NavMain,
NavUser,AppHeader}.tsx`, the sidebar-07 shadcn primitives + `hooks/use-mobile` under `components/ui/`,
a `layout`/nav-model addition in `lib/` (or `components/layout/nav.ts`), and the `uiStore`
`sidebarOpen` field. `routes/app.tsx` `AppShell` rewritten to the sidebar composition. **No** change to
`features/*`, `packages/*` contracts, `apis/edge-api/admin`, `db/migrations`, or any `contracts/*.md`
except the web contract's routing/shell note.

## Amendment D2 — Neutral theme + responsive scaling (FR-024/FR-025, presentation-only)

> **⚠ Reversal (2026-07-15) — the responsive-scaling half was removed.** The fluid root-font-size
> scaling (D2-b below, FR-025/SC-015) and the `max-w-[1800px]` content cap were reverted by request
> across all three web surfaces. `packages/design-system/src/scale.css` and its `./scale.css`
> package export are **deleted**; no surface imports it. Sizing is now the **shadcn/Tailwind default**
> (16px root, full-width content). **The neutral-theme half (D2-a, FR-024/SC-014) still stands** —
> everything in this section about surfaces/accent remains in effect; only the scaling is gone.

**Trigger**: operator directive (2026-07-09, verbatim in [operator-directives.md](./operator-directives.md)) —
remove the green-tinted surfaces ("green-white"/"green-black" blends on the sign-in background, sidebar,
hovers), follow the shadcn **`sidebar-07` neutral base**, keep **emerald as the only accent**; and add
**proportional UI scaling** so wide displays don't look small/empty ("find the industry-standard way").
Spec: **FR-024** (neutral surfaces + single accent), **FR-025** (large-screen scaling), **SC-014/SC-015**.

**Scope boundary**: **presentation-only, and confined to `packages/design-system`** (the brand SSOT).
Both changes are token/CSS edits in the design-system — **no component, feature, route, backend, data,
or auth change**. Because every surface (sign-in screen + dashboard shell + shadcn primitives) already
consumes the design-system tokens (Principle V), neutralising the tokens and scaling the root font-size
propagate everywhere with **zero per-component edits**. Technical Context, Constitution Check, and all
prior artifacts hold; only the design-system delta below is new.

### D2-a — Neutral surfaces, single emerald accent (research [Part H](./research.md#part-h))

The current `tokens.css` tints its neutrals green (`--accent #e6f7f0`/`#063a2b`, `--sidebar #f4f8f6`/
`#111815`, greenish `--secondary`/`--muted`/`--border`, `--accent-foreground #047857`). D2-a **rebases
every surface token onto the neutral (Tailwind `neutral`) scale** — matching shadcn's `sidebar-07`
default — while **keeping the accent colour**:
- **`--primary` stays Jade `#0FB57E`** (light + dark) — the single accent; `--ring` and `--sidebar-primary`
  stay `#0FB57E` too (branded focus + brand mark). This is the "emerald as primary" the directive asks for.
- **`--accent`/`--accent-foreground` (hover), `--secondary`, `--muted`, `--border`, `--input`, and all
  `--sidebar*` surfaces → neutral greys** (light `#f5f5f5`/`#e5e5e5`/`#737373` family; dark `#262626`/
  `#171717`/`#a1a1a1` family). The active nav item (which uses `--sidebar-accent`) becomes a **neutral**
  highlight — faithful to `sidebar-07`, and consistent with "emerald only as the primary."
- **`--background`/`--card`/`--foreground`** move off the green-black/green-white to true neutral
  (light `#ffffff`/`#0a0a0a`; dark `#0a0a0a`/`#fafafa`, card `#171717`). This kills the sign-in
  background blend the user flagged.
- Exact values are pinned in research Part H (a single token table, light + dark). Edited **once** in
  `packages/design-system/src/tokens.css`; the `@theme inline` mappings already exist (D1) — no new
  wiring. The sign-in screen and the shell change appearance with **no** file edits of their own.

**Governance (why no constitution amendment)**: Principle V locks "Brand color is Jade `#0FB57E`; fill
`#047857`." D2-a **retains `#0FB57E` as the brand/primary/accent** — Jade *is* an emerald shade, so
"emerald primary" is satisfied without changing the locked hex. The **fill `#047857`** remains the
defined brand fill (available for a darker-jade state, e.g. primary pressed) but **stops tinting neutral
surfaces** — the constitution mandates the fill *exists as a brand token*, not that it tint backgrounds.
So Principle V holds; **no amendment required.** (If the operator later wants the literal Tailwind
`emerald` hex `#10b981`/`#059669` instead of `#0FB57E`, *that* is a one-line token change **and** a
Principle-V constitution note — out of scope here unless requested.)

### D2-b — Fluid root-font-size scaling (research [Part I](./research.md#part-i))

**Decision: scale the root (`:root`/`html`) font-size fluidly with viewport width.** Tailwind v4 + shadcn
are **fully `rem`-based** (spacing scale `--spacing`, type, control heights, radii, `--sidebar-width`), so
a single root-font-size rule scales **type, spacing, controls, and layout density together** — exactly the
"make the components a bit bigger on wide screens" the directive wants — with **zero** per-component work.
- **Technique**: `:root { font-size: clamp(<baseline>, <rem + vw>, <cap>) }`, **rem-anchored** so it still
  honours user zoom (the WCAG gotcha with bare `vw` — research Part I). Tuned so the value equals the
  **laptop baseline (16px) up to a large-width threshold (~`2xl`, 1536px)** and scales up **above** it,
  **capped** for ultrawide (~1.25–1.375rem). Baseline (small/laptop) is **unchanged** (FR-025).
  *Alternative recorded*: stepped `@media (min-width: 1536px/1920px/2560px) { :root { font-size } }` — same
  effect, simpler/steppier; either is industry-standard, clamp chosen for smoothness.
- **Plus a content max-width cap**: the main content region gets a large centered `max-width` so ultrawide
  doesn't stretch line lengths unreadably (spec edge case) — a small layout class on the `SidebarInset`
  content wrapper in `routes/app.tsx` (the one component touch this amendment allows).
- Lives in the **design-system** (`tokens.css` or a sibling `scale.css` it imports), so **all** surfaces
  inherit it. No JS, **no new client state** (it is pure CSS — the `uiStore` is untouched).

### Testing + verification delta

Pure CSS/token change — no new unit tests are meaningful (Vitest doesn't evaluate layout). Verification is
**visual**, via the same seeded-session screenshot harness used for D1/T058: capture sign-in + shell in
light/dark to confirm **neutral surfaces + emerald-only accent** (SC-014), and at laptop vs wide vs
ultrawide widths to confirm **proportional scaling with no overflow** (SC-015). Folds into the T046/T058
sign-off. (A cheap guard test MAY assert `tokens.css` contains no green-tinted surface hex, mirroring the
SC-007 hygiene grep.)

### Structure delta

Edit **`packages/design-system/src/tokens.css`** (neutral token values + root-font-size scaling; optionally
a sibling `scale.css`). One small layout class on the content wrapper in `apps/back-office/src/routes/app.tsx`
(max-width cap). Update `packages/design-system/README.md` (brand = single accent; neutral surfaces; the
scaling rule). **No** change to `features/*`, `components/*` (shadcn primitives already theme from tokens),
`apis/edge-api/admin`, `db/migrations`, or any backend contract.

## Complexity Tracking

> Constitution deviations requiring justification (Quality Gates: recorded here, not silently
> taken). The client-stack deviations flagged at first draft were **resolved by the operator via
> constitution amendment v1.4.0** (2026-07-08) — so they are no longer open deviations; recorded
> here for the audit trail.

| Item | Status | Resolution / rationale |
|---|---|---|
| **TanStack Store as web client-state lib** (was: deviation from locked Zustand) | **RESOLVED — now the standard** | Operator ratified **v1.4.0**: Web standard = client state via TanStack Store, **Zustand removed** platform-wide. ARCHITECTURE admin-web wording softened to "server-state cache for all server data; a minimal client store (TanStack Store) for genuine client state only." Used for theme/command-palette/hotkey scope only. |
| **Expanded TanStack footprint** (Router/Table/Form/Virtual/DevTools) | **RESOLVED** | v1.4.0 names the full TanStack suite as the locked web client spine, so shop-web/customer-web inherit it rather than re-decide. |
| **`@tanstack/react-hotkeys` (alpha)** for keyboard shortcuts | **Accepted risk (operator-chosen)** | Operator chose the alpha TanStack Hotkeys over GA `react-hotkeys-hook` (2026-07-08). API may change; contained by pinning exactly + isolating usage behind one `lib/` wrapper. Exercised trivially this slice. |
| **TanStack DB** | **Dropped this slice (operator-confirmed)** | Not wired — beta/pre-1.0 with zero surface in a data-less bootstrap (research A3). Constitution v1.4.0 records it as not-yet-adopted. Revisit at the first real product-collection slice. |
| **Scope expansion: first real `admin`-schema data layer** | **Not a deviation — constitution-aligned** | The staff/RBAC tables realize the `admin` schema's constitutional purpose ("back-office accounts + audit"); the DB is reached only via the cold path (Principle III) with raw SQL (Principle VI). Recorded because it grows the slice beyond a pure web bootstrap (operator's persistence decision). It also gives 003's `db-up` its first real exercise. |
| **Default dashboard shell from shadcn `sidebar-07`** (Amendment D1) | **Not a deviation — constitution-aligned** | shadcn's "copy components per app" model (research B3); primitives land in `components/ui/`, composed chrome in `components/layout/`, all **themed from the design-system SSOT** (Principle V — no hardcoded brand). Presentation-only: reuses the existing session/sign-out/role/theme wiring, adds no data path. The block's demo data (fake teams/projects) is dropped to fit the single-brand, bootstrap reality. |
| **Neutral theme + responsive scaling** (Amendment D2) | **Not a deviation — Principle V holds** | Surfaces neutralised + root-font-size scaling, edited **once** in the design-system SSOT (never per surface — Principle V). **Jade `#0FB57E` retained** as the single accent (emerald shade), fill `#047857` remains a brand token but stops tinting surfaces → **no constitution amendment** (see Amendment D2 § Governance). Presentation-only, no data/auth path. |

## Phase 1 artifacts

Generated alongside this plan: [data-model.md](./data-model.md) · [contracts/](./contracts/)
(back-office-web, staff-schema, back-office-me, admin-ping, config) ·
[quickstart.md](./quickstart.md). Agent context (CLAUDE.md managed block) updated to point here.
`/speckit-tasks` derives the ordered task list from these.

**Amendment D1 touchpoints** (presentation-only): research [Part G](./research.md#part-g) (the
sidebar-07 decision), [data-model.md § 8](./data-model.md) (the role-aware nav model + `sidebarOpen`
UI state), [back-office-web.contract.md § 5](./contracts/back-office-web.contract.md) (shell/nav/
breadcrumb), and [quickstart.md](./quickstart.md) US1 step (SC-013 shell validation). No
data/contract artifact for the backend changes — there is no backend change.

**Amendment D2 touchpoints** (presentation-only, design-system-scoped): research [Part H](./research.md#part-h)
(neutral token table, light + dark) + [Part I](./research.md#part-i) (root-font-size scaling, cited),
[data-model.md § 9](./data-model.md) (theme/scale are pure CSS — no new client state),
[back-office-web.contract.md § 6](./contracts/back-office-web.contract.md) (neutral surfaces + single
accent + responsive scaling), and [quickstart.md](./quickstart.md) (SC-014/SC-015 visual checks). No new
contract file — the change is design-system tokens/CSS only.

---

## Follow-up raised by 007-shop-web (2026-07-09) — `admin.staff.email` may hold a UUID

While designing the shop staff record, feature 007 found a probable defect here. **Not fixed by
007** (out of its scope); recorded so it is not silently inherited.

`apis/edge-api/admin/src/functions/back-office-me-v1-get.ts` resolves the staff email as:

```ts
const email = claim(event, "username") ?? sub;
```

The back-office pool sets `username_attributes = ["email"]`. In that configuration Cognito's
internal username is widely reported to be a **generated UUID**, and a Cognito **access token
carries no `email` claim** at all (`sub`, `username`, `cognito:groups`, `client_id`, …). If so,
`admin.staff.email` is currently storing UUIDs rather than addresses, and `/admin/v1/me` returns one
to the console.

**Verify first** (2 minutes, operator): decode a real back-office access token and inspect
`username` — the same check 007 scripts in
[its quickstart §4](../007-shop-web/quickstart.md). Record the result before changing anything.

**If confirmed**, 007's approach is the precedent to follow (see its
[research R6](../007-shop-web/research.md)): make the column nullable, resolve the email only when
the token genuinely carries one (`claim("email") ?? emailShaped(claim("username")) ?? null`), never
overwrite a stored address with null (`COALESCE` in the upsert), and let the operator provisioning
step be authoritative for the value — exactly as 006's `create-first-admin` already is for `name`.

Deliberately **not** adopted as a fix: sending the ID token as bearer (it is not an authorization
token), or calling `AdminGetUser` per first contact (IAM + a network hop on the auth path for a
value provisioning already knows).
