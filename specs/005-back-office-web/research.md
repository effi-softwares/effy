# Phase 0 Research — 005 Back-Office Web Foundation

**Feature**: [spec.md](./spec.md) · **Directives**: [operator-directives.md](./operator-directives.md) ·
**Date**: 2026-07-08 · **Constitution**: v1.3.1

Four internet research passes (per operator-directives research mandates) plus one
codebase-dependency verification. Decisions are cited as **R#** throughout plan.md.
Version numbers were pulled live from the npm registry JSON API + official docs on
2026-07-08; treat them as pins to confirm at install, not gospel forever.

---

## Part A — Client spine: the TanStack suite (Vite + React 19)

**A1 — Adopt as the locked "client spine" (all GA, and a bootstrap can meaningfully wire them):**

| Role | Package | Pin | Notes |
|---|---|---|---|
| Router | `@tanstack/react-router` | 1.170.17 | Code-based programmatic route tree (no Vite plugin needed for a small app); `createRootRouteWithContext<{ queryClient; auth }>()`; `beforeLoad` auth guard `throw redirect(...)`. Matches ARCHITECTURE admin-web "programmatic tree + protected layout beforeLoad". |
| Query | `@tanstack/react-query` | 5.101.2 | Server-state cache = source of truth (Principle VI). The **one** data lib the proving reads genuinely exercise today. Same `QueryClient` instance handed into the router context. |
| Table | `@tanstack/react-table` | 8.21.3 (v8) | Headless. v8 last published 2025-04 = maturity, not abandonment (v9 is alpha). Admin consoles are table-first — set the pattern now even before there's data to fill a grid. |
| Form | `@tanstack/react-form` | 1.33.0 | **1.0 GA shipped.** Drives the OTP entry form (US1). Standard-Schema validation. |
| DevTools (unified) | `@tanstack/react-devtools` | 0.10.8 | The **new combined panel** hosts per-lib `*Panel` exports (`ReactQueryDevtoolsPanel`, `TanStackRouterDevtoolsPanel`) in one draggable shell — supersedes mounting each standalone. 0.x but **dev-only** (tree-shaken from prod) → negligible risk. |

**A2 — Wire as foundation but defer first real use** (production-ready libs with nothing to
bite on in a data-less bootstrap — add the dependency when the feature lands; do not force a
fake use):
- `@tanstack/react-virtual` 3.14.5 — no long lists to virtualize yet.
- **`@tanstack/react-hotkeys` 0.10.0 (ALPHA)** for keyboard shortcuts — **operator decision
  (2026-07-08): use the alpha TanStack Hotkeys**, not `react-hotkeys-hook`. Accepted risk: the
  library's API is still subject to change; it is dev-facing shortcut wiring, exercised
  trivially this slice, so churn cost is contained. Pin exactly and isolate its usage behind a
  thin `lib/` wrapper so a breaking upgrade touches one file.

**A3 — DROP for this slice — `@tanstack/react-db`.** **Operator decision (2026-07-08): do not
adopt TanStack DB** ("we do not [need] TanStack DB if it [is] hard"). Rationale confirmed by
research: it is **beta / pre-1.0** (react adapter 0.1.92, core 0.6.14, API churning), and its
value — normalized client collections, live queries, optimistic writes — has **zero surface** in
a data-less bootstrap. TanStack Query alone covers this slice. **Revisit** at the first slice
with real product collections (catalog/orders) and a concrete optimistic/live-query need.

**A4 — Client state store — `@tanstack/react-store` 0.11.0, LOCKED (Zustand removed).**
**Operator decision (2026-07-08): standardize on TanStack Store; remove Zustand from the tech
lock.** Applied as **constitution v1.4.0** (Web standard: client state via TanStack Store, no
Zustand, platform-wide). Store is the engine transitively under Query/Router/Form, is ~3 KB, and
keeps the web surface TanStack-consistent. Used for **genuine client-only state only** (theme,
command-palette open, hotkey scope); **server data never goes here** (Principle VI). No longer a
deviation — it is now the standard.

**A5 — Routing mode: code-based, not file-based.** For a bootstrap with a handful of routes, a
hand-authored programmatic route tree (`createRouter({ routeTree, context })`) is simpler than
adding the `@tanstack/router-plugin` codegen, and maps 1:1 onto ARCHITECTURE admin-web's
"programmatic tree" wording. Graduate to file-based when the route count justifies it.

---

## Part B — UI toolkit: shadcn/ui init + preset `b2BnwlLOK`

**B1 — All four directive flags are valid** in current shadcn CLI v4 (`--preset`, `--base`,
`--template`, `--pointer`). (A stale in-repo shadcn skill doc claims `--base`/`--pointer` don't
exist — it is wrong vs the live `ui.shadcn.com/docs/cli` help text.)

- `--preset b2BnwlLOK` — a **preset code**: a version-prefixed base62 string encoding a full
  design-system config (base color, theme, radius, fonts, icon lib, menu style) from the shadcn
  visual builder. **Not** a component/registry item. **Inspect before adopting:**
  `pnpm dlx shadcn@latest preset decode b2BnwlLOK` prints the config without applying it.
- `--base radix` — components built on **Radix UI** primitives (vs the newer Base UI).
- `--template vite` — **scaffolds a fresh Vite+React app** (esp. with `--name`), not "configure
  my existing app". In a monorepo without `--monorepo`/`--name` it will prompt or create a
  self-contained app whose lockfile/deps/Turbo wiring won't match the workspace.
- `--pointer` — enables `cursor: pointer` on buttons (small token toggle).
- **Tailwind v4** (via `@tailwindcss/vite`), React 19-compatible.

**B2 — Decision: inspect → scaffold isolated → reconcile into monorepo.** (1) `preset decode`
and confirm it carries / can be overridden to the **Jade brand #0FB57E / fill #047857** (the
brand is the binding SSOT, Principle V — the preset must not win over it). (2) Run the directive
init to a clean throwaway dir with `--name back-office`. (3) Move into `apps/back-office`, delete
the nested lockfile, align `package.json`/deps to the workspace catalog, add to
`pnpm-workspace.yaml` + Turbo pipeline. (4) Point the app's tokens at
`packages/design-system` so Jade lives in one place; app-local `components/ui/` (shadcn's copied
components) are themed *from* those tokens. *Alternative*: manual in-place Vite install (write
`components.json`/Tailwind wiring by hand) — lower monorepo conflict, more manual work; use if
the scaffold-then-move proves fiddly.

**B3 — Brand-token ownership (Principle V).** `packages/design-system` owns the Jade tokens,
Tailwind v4 `@theme`, dark-mode wiring, and `cn` util = the cross-surface single source of truth.
shadcn's per-app copied components are allowed to live in `apps/back-office/src/components/ui/`
(that is shadcn's model); a **graduation rule** (documented, mirroring 004's lib→package rule)
moves any genuinely shared UI component up to `design-system` when the **second** web surface
appears. This keeps "tokens shared, components copied" honest without premature abstraction.

---

## Part C — Auth: Amplify JS → existing admin Cognito pool, passwordless EMAIL_OTP

**C1 — `aws-amplify` v6, manual client config, no backend project, no identity pool.** The pool
is Terraform-owned (001); the app is a pure consumer. `Amplify.configure({ Auth: { Cognito: {
userPoolId, userPoolClientId, loginWith: { email: true } } } })` — region is derived from the
pool-id prefix; **omit** `identityPoolId` (user-pool JWT sign-in only) and omit sign-up config
(admin-provisioned). Reject `referenceAuth`/`defineAuth` (they need an Amplify backend). Vite v6
needs **no** Buffer/global polyfills (that was a v5 problem). React 19 fine.

**C2 — Passwordless EMAIL_OTP via the `USER_AUTH` choice-based flow** (confirmed against the live
Amplify sign-in doc — the managed native factor, not CUSTOM_AUTH Lambda triggers):
```
signIn({ username: email, options: { authFlowType: 'USER_AUTH', preferredChallenge: 'EMAIL_OTP' } })
  → nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE'
confirmSignIn({ challengeResponse: code })  → nextStep.signInStep === 'DONE'
```

**C3 — Tokens for API Gateway.** `fetchAuthSession()` → send the **access** token as
`Authorization: Bearer` (matches edge-api's JWT authorizer, which checks `client_id` on the
access token — 004 research D3). Read RBAC groups from `accessToken.payload['cognito:groups']`
(present on both tokens; use the access token). `fetchAuthSession()` auto-refreshes when a valid
refresh token exists; `{ forceRefresh: true }` mints a fresh one on demand. Send the access
token, **never** the ID token, to the backend.

**C4 — DEPENDENCY VERIFIED IN-REPO — no 001 amendment needed.** The 001 cognito module already
builds each pool's app client with `explicit_auth_flows = ["ALLOW_USER_AUTH", "ALLOW_REFRESH_
TOKEN_AUTH"]`, `sign_in_policy.allowed_first_auth_factors = ["EMAIL_OTP"]`, tier ESSENTIALS+, and
a **public client (no secret)** — exactly the shape Amplify's `USER_AUTH`/`EMAIL_OTP` flow
requires (`infra/modules/cognito-user-pool/main.tf`, `infra/envs/dev/auth-backoffice.tf`). The
only operator confirmation is that SES email delivery is live for the pool (assumed from the 001
deploy). **This removes the largest execution risk.**

**C5 — Config is non-secret, supplied at build time.** The pool id, app-client id, and edge-api
base URL are **not secrets** (Cognito public client, public API). They reach the Vite build as
`VITE_*` env (see config.contract.md), sourced by the operator from the 001/004 SSM contract
values. No secret ever enters the web bundle or the repo (FR-014). The dev origin
(`http://localhost:5173`, Vite default) must be added to edge-api's `corsOrigins` (see Part D).

---

## Part D — Backend addition: the admin-only proving endpoint (FR-018)

**D1 — Shape.** One new route on the existing `edge-api` cold path:
`GET /v1/back-office/admin/ping`, behind the existing **`backOfficeJwt`** authorizer, authorizing
the **`admin`** group only (manager/csa → shared `forbidden` problem). Mirrors
`back-office-ping-v1-get.ts` but with `ADMIN_GROUPS = ["admin"]`. New handler
`src/functions/back-office-admin-ping-v1-get.ts` + serverless function `backOfficeAdminPingV1` +
its 3 CloudWatch alarms (errors/throttles/duration-p95) matching the existing pattern.
Reuses `lib/claims` (`hasAnyGroup`) and `lib/http` (`forbidden`, `json`, `preamble`) unchanged.

**D2 — CORS.** Add `http://localhost:5173` to `provider.httpApi.cors.allowedOrigins`
(`params.default.corsOrigins`) so the locally-run console (an approved dev origin) can call
edge-api. Unapproved origins stay refused (spec edge case). Requires an operator `edge-deploy`.

**D3 — Versioning + error contract.** The new route carries `/v1` per the platform versioning
policy (`docs/api/versioning-policy.md`); its refusals use the RFC 9457 problem+json envelope
(`docs/api/error-envelope.md`). It returns no product data (foundation-only). `docs/api/` gains a
one-line note for the new route.

**D4 — This is the single sanctioned backend change** (spec clarification Option B). Everything
else in the slice is the web app.

---

## Part E — Structure & tooling

**E1 — Placement.** `apps/back-office/` (first web surface; joins the pnpm workspace) +
`packages/design-system`, `packages/shared-types`, `packages/api-client` (first shared web
packages — FR-010; workspace globs `apps/*` + `packages/*` are activated). The edge-api change
lands in the existing `services/edge-api/`.

**E2 — Shared packages now vs later.** Spec FR-010/US4 **mandates** the shared web foundation
this slice — so unlike 004's "defer to 2nd consumer" lib rule, the brand tokens (design-system,
binding SSOT per Principle V) and the DTO/error types (shared-types, SSOT per Principle II) are
genuinely cross-surface and are created now, **populated only with what US1–US4 need**. The
authed-fetch + error-contract wrapper (api-client) is likewise reused by every future surface →
a package now. Component-level sharing still follows a graduation rule (B3).

**E3 — Testing.** Vitest + React Testing Library for component/hook/unit (auth state machine,
role-gate rendering, error-contract mapping, DTO↔domain mappers). The full live sign-in +
proving-read + role-refusal flow is an **operator-run** quickstart pass against dev (real Cognito
OTP email + live edge-api), not automated CI. edge-api's new handler gets a Vitest handler test
(admin served / manager+csa refused) mirroring the existing back-office ping test.

**E4 — What is explicitly OUT.** Hosted deploy (Amplify Hosting) — local only (spec). TanStack
DB (A3). Real **product** admin CRUD (no product data — but the back-office **staff/RBAC**
account tables ARE in scope, Part F). PostHog wiring beyond the typed taxonomy seam + error
routing (product analytics has one flow — sign-in — to instrument; full dashboards arrive with
the observability infra slice, as in 004).

---

## Part F — Back-office staff & RBAC persistence (operator decision 2026-07-08)

The platform keeps its **own** system of record for back-office staff + roles rather than relying
solely on Cognito (spec Clarification 2 / US4 / FR-019–022). Design decisions:

**F1 — Schema (normalized RBAC, `admin` schema, via the 003 migration workflow).** The `admin`
schema is constitutionally "back-office accounts + audit" — this realizes it. First real tables
beyond the 003 baseline shell; also the **first exercise of `make db-up`**.
- `admin.staff` — `id uuid pk default gen_random_uuid()`, `cognito_sub text unique not null`
  (the verified subject — the join key), `email text not null`, `status text not null default
  'active' check (status in ('active','disabled'))`, `created_at`, `updated_at`, `last_seen_at
  timestamptz`.
- `admin.role` — lookup: `key text pk check (key in ('admin','manager','csa'))`,
  `description text`. Seeded with the three roles (idempotent seed in the migration).
- `admin.staff_role` — `staff_id uuid → admin.staff(id) on delete cascade`, `role_key text →
  admin.role(key)`, `granted_at timestamptz default now()`, `pk (staff_id, role_key)`.
- *Alternatives*: a `roles text[]`/enum column on `staff` (rejected — FK integrity + future
  role management + audit are cleaner normalized; three rows of overhead is trivial).
- Audit-lite now (`created_at`/`last_seen_at`); a full `admin.audit_log` of privileged actions
  is deferred to the first slice with real actions to audit.

**F2 — JIT provisioning (upsert on first authenticated backend contact).** Staff are
admin-provisioned in Cognito; the backend never sees sign-in (Amplify ↔ Cognito directly), so
the **first authenticated request** is where the platform first meets them. The staff-identity
read (`GET /v1/back-office/me`) upserts idempotently:
`INSERT ... ON CONFLICT (cognito_sub) DO UPDATE SET email=…, last_seen_at=now(), updated_at=now()`
— safe under concurrent first contact (no duplicate; the unique `cognito_sub` + `ON CONFLICT`
is the idempotency guarantee, mirroring 004's idempotent-consumer pattern). Roles are reconciled
from the token's `cognito:groups` into `admin.staff_role` in the same transaction (delete-absent
+ insert-present, or a small diff).

**F3 — Authorization decision reads the platform record (status + role) — the "not solely
Cognito" proof.** The admin-only gate (`GET /v1/back-office/admin/ping`, FR-018) authorizes by
reading `admin.staff.status = 'active'` **AND** an `admin.staff_role` row with `role_key='admin'`
— **not** the token claim alone. So a staff row set `status='disabled'` is **refused despite a
valid admin token** (SC-012). Roles are seeded from Cognito (F2) so role-content matches the
claim today; the durable, demonstrable independence this slice delivers is the **status** gate +
the record existing as a queryable/auditable authority. *Platform-authoritative role management*
(editing roles in the DB and pushing to Cognito) is a later slice.

**F4 — Write-on-read is acceptable here.** `GET /me` performs an idempotent upsert side-effect
(last_seen + JIT create). This is the standard "backend meets the user on first authenticated
call" pattern (the backend has no sign-in event to hook); the write is idempotent and
last-seen-style, not a mutation of business data. Documented so it is a deliberate choice, not an
accident. *Alternative*: a dedicated `POST /session` heartbeat (rejected — an extra endpoint for
no gain; `/me` is the natural touchpoint).

**F6 — Build order (decouple — keeps priorities monotonic).** To avoid US4 (P4) becoming a hidden
dependency of US2 (P2) and US3 (P3): US2's proving read uses the **existing 004
`/v1/back-office/ping`** (token echo, no DB); US3's admin gate ships **role-claim-based**
(`hasAnyGroup('admin')`, no DB); **US4** then introduces `/me` + the tables (the identity screen
graduates from `/ping` to `/me`) and **upgrades** the admin gate to authorize from the DB record
(status + role). Each story stays independently testable; the DB layer is a hardening step, not a
prerequisite for the earlier proofs. Role-less handling differs by endpoint by design: `/ping`
denies role-less; `/me` admits + records them (roles `[]`).

**F5 — edge-api structure for a second domain.** 004's edge-api kept `service.ts`/`repository.ts`
at `src/` root for the single `platform-status` domain. Adding a `staff` domain graduates edge-api
to **per-domain folders**: `src/staff/{service.ts,repository.ts,types.ts}` (raw SQL via the
existing `lib/db` pool; explicit row→domain mappers, no ORM — Principle VI), with the existing
platform-status files moving to `src/platform-status/` (or staying, documented). New handlers
`back-office-me-v1-get.ts` + the FR-018 `back-office-admin-ping-v1-get.ts` call the `staff`
service. Repository tests use the existing testcontainers/local-PG pattern against the real
`admin` tables.
