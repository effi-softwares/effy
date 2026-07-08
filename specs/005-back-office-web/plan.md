# Implementation Plan: Back-Office Web Foundation (Bootstrap)

**Branch**: `005-back-office-web` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-back-office-web/spec.md`, binding
[operator-directives.md](./operator-directives.md), [research.md](./research.md) (Phase 0),
constitution **v1.4.0**, [ARCHITECTURE.md](../../ARCHITECTURE.md) (binding — the
"Operator / admin web (SPA)" section governs this feature).

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
  against the existing 001 **admin** pool. Client state via **TanStack Store** (constitution
  v1.4.0 — Zustand removed). Proving surfaces: passwordless sign-in → console shell → a
  identity proving read (the existing `/v1/back-office/ping` at P2, **graduating** to the
  record-backed `/v1/back-office/me` at US4) → an **admin-only** read
  (`/v1/back-office/admin/ping`) whose authorization is role-claim-based at US3 and **upgraded to
  the DB record (status+role) at US4**. Built as an MVP ladder (each story independently
  testable). **Runs locally only** this slice (hosted deploy deferred).
- **`packages/design-system`** (Jade `#0FB57E`/`#047857` tokens + Tailwind v4 theme + dark mode
  + `cn` — the brand SSOT, Principle V), **`packages/shared-types`** (DTO + error-envelope types,
  the contract SSOT, Principle II), **`packages/api-client`** (authed fetch wrapper + RFC 9457
  error mapping) — the first shared web foundation (FR-010), populated with only what US1–US5
  need.
- **`services/edge-api` + `db/migrations`** — the back-office **staff/RBAC data layer**: a new
  migration adding the **`admin.staff` / `admin.role` / `admin.staff_role`** tables (003
  workflow — the first real tables + first `db-up`); a `staff` domain (raw-SQL repository +
  service) that **JIT-upserts** the staff record on first contact and reconciles roles; a new
  `GET /v1/back-office/me` (records + returns the platform record); and `GET /v1/back-office/
  admin/ping` (admin group only) authorizing from the **DB record — status + role** (FR-020), so
  a `disabled` staff row is refused despite a valid token. Plus the alarms + the `localhost:5173`
  dev CORS origin. (Spec Clarification Option B + the persistence clarification / FR-018–022.)

All technology choices trace to Phase 0 [research.md](./research.md) (four internet passes +
one in-repo dependency verification). Pins are in research Part A; the largest execution risk
(admin-pool auth-flow config) is **verified already satisfied** in 001 (research C4).

## Technical Context

**Language/Version**:
- `apps/back-office`: TypeScript **5.9.x**, React **19.x**, Vite **7.x** (`@vitejs/plugin-react`).
- `services/edge-api` delta: TypeScript on `nodejs22.x`/arm64 (unchanged from 004).

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
(`/me` records+returns; `/admin/ping` admin-served / manager+csa+**disabled** refused). Full
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
backend routes (`/me`, `/admin/ping`). No **product** features, no hosted deploy, no TanStack DB,
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
| **III. Dual-path discipline** | PASS | The console is a **cold-path** client of `edge-api` (ops/back-office audience — correct path per the FR-014 rule). The backend additions (`/me`, `/admin/ping`, the `staff` data layer) are latency-tolerant, low-frequency ops work → cold path. The staff/RBAC tables live in the DB's `admin` schema (back-office accounts + audit — its constitutional purpose), reached only via the cold path. No hot-path traffic introduced. |
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
- **Backend (edge-api delta)**: the new `/me` + `/admin/ping` handlers inherit the existing pino
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
│   ├── back-office-me.contract.md    # GET /v1/back-office/me — record + return (FR-005/019)
│   ├── admin-ping.contract.md        # GET /v1/back-office/admin/ping — DB-record authz (FR-018/020)
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
│   │   └── app.tsx                     # PROTECTED layout: beforeLoad → ensure session or redirect
│   ├── features/
│   │   ├── auth/                       # the session feature (US1)
│   │   │   ├── repo.ts                 # Amplify calls: signIn/confirmSignIn/signOut/fetchAuthSession
│   │   │   ├── queries.ts              # session-as-a-query + sign-in/out mutations
│   │   │   ├── model.ts                # SessionState machine + Identity/roles domain types
│   │   │   ├── SignInScreen.tsx        # email → OTP (TanStack Form)
│   │   │   └── guards.ts               # requireSession / requireGroup(...) for beforeLoad
│   │   └── staff-identity/             # the proving feature (US2 + US3 + US4 read side)
│   │       ├── repo.ts                 # GET /v1/back-office/ping→/me (US2→US4) + /admin/ping (DTO↔domain)
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
│   └── components/ui/                  # shadcn components (themed FROM design-system tokens)
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

# services/edge-api delta (FR-018–022)
services/edge-api/src/staff/repository.ts        # raw SQL: upsert-on-conflict, role reconcile, status/role read
services/edge-api/src/staff/service.ts           # JIT provisioning + authorize(status active AND role)
services/edge-api/src/staff/types.ts             # StaffRecord domain type + row mappers
services/edge-api/src/staff/repository.test.ts    # upsert idempotency, reconcile, disabled-denial (testcontainers)
services/edge-api/src/functions/back-office-me-v1-get.ts          # records + returns the platform staff record
services/edge-api/src/functions/back-office-admin-ping-v1-get.ts  # admin gate → authorizes from DB (status+role)
services/edge-api/src/functions/back-office-*.test.ts             # /me + /admin/ping handler tests
services/edge-api/serverless.yml        # + backOfficeMeV1 & backOfficeAdminPingV1 fns + alarms + localhost:5173 CORS
docs/api/                               # + notes for /v1/back-office/me and /v1/back-office/admin/ping

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
- *Authoritative layer*: the admin-only **screen actually calls** `GET /v1/back-office/admin/ping`.
  The **backend** decides — not the hidden button: at **US3 (P3)** by the role claim
  (`hasAnyGroup('admin')`), then **upgraded at US4 (P4)** to the DB record (status `active` AND
  role `admin` — mechanic 3). For an admin it serves; for manager/csa (or, post-US4, a `disabled`
  admin) it returns the shared `forbidden`, which the console surfaces (SC-004/SC-012). The proof
  is the backend's 403 — independently testable at P3 and hardened at P4.

**3 — JIT staff provisioning + DB-record authorization (US4 / FR-019–022, the "not solely
Cognito" mechanic).** The backend never sees sign-in (Amplify ↔ Cognito directly), so it meets a
staff member on their **first authenticated call**: `GET /v1/back-office/me` runs an **idempotent
upsert** — `INSERT ... ON CONFLICT (cognito_sub) DO UPDATE ...` — creating/refreshing the
`admin.staff` row and reconciling `admin.staff_role` from the token's `cognito:groups`, then
returns the platform record. Concurrent first contact yields exactly one row (the unique
`cognito_sub` + `ON CONFLICT` is the idempotency guarantee — same discipline as 004's idempotent
consumer). Authorization for the admin gate then reads **status + role from the DB**, so setting a
row `status='disabled'` denies a valid-token admin (SC-012) — the concrete independence from
Cognito. Roles are Cognito-seeded this slice; DB-authoritative role *management* is a later slice.
(`GET /me`'s idempotent last-seen write-on-read is a deliberate, documented choice — research F4.)

## Complexity Tracking

> Constitution deviations requiring justification (Quality Gates: recorded here, not silently
> taken). The client-stack deviations flagged at first draft were **resolved by the operator via
> constitution amendment v1.4.0** (2026-07-08) — so they are no longer open deviations; recorded
> here for the audit trail.

| Item | Status | Resolution / rationale |
|---|---|---|
| **TanStack Store as web client-state lib** (was: deviation from locked Zustand) | **RESOLVED — now the standard** | Operator ratified **v1.4.0**: Web standard = client state via TanStack Store, **Zustand removed** platform-wide. ARCHITECTURE admin-web wording softened to "server-state cache for all server data; a minimal client store (TanStack Store) for genuine client state only." Used for theme/command-palette/hotkey scope only. |
| **Expanded TanStack footprint** (Router/Table/Form/Virtual/DevTools) | **RESOLVED** | v1.4.0 names the full TanStack suite as the locked web client spine, so store-web/customer-web inherit it rather than re-decide. |
| **`@tanstack/react-hotkeys` (alpha)** for keyboard shortcuts | **Accepted risk (operator-chosen)** | Operator chose the alpha TanStack Hotkeys over GA `react-hotkeys-hook` (2026-07-08). API may change; contained by pinning exactly + isolating usage behind one `lib/` wrapper. Exercised trivially this slice. |
| **TanStack DB** | **Dropped this slice (operator-confirmed)** | Not wired — beta/pre-1.0 with zero surface in a data-less bootstrap (research A3). Constitution v1.4.0 records it as not-yet-adopted. Revisit at the first real product-collection slice. |
| **Scope expansion: first real `admin`-schema data layer** | **Not a deviation — constitution-aligned** | The staff/RBAC tables realize the `admin` schema's constitutional purpose ("back-office accounts + audit"); the DB is reached only via the cold path (Principle III) with raw SQL (Principle VI). Recorded because it grows the slice beyond a pure web bootstrap (operator's persistence decision). It also gives 003's `db-up` its first real exercise. |

## Phase 1 artifacts

Generated alongside this plan: [data-model.md](./data-model.md) · [contracts/](./contracts/)
(back-office-web, staff-schema, back-office-me, admin-ping, config) ·
[quickstart.md](./quickstart.md). Agent context (CLAUDE.md managed block) updated to point here.
`/speckit-tasks` derives the ordered task list from these.
