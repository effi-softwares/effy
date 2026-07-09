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
(`http://localhost:5173`, Vite default) must be an allowed CORS origin at the edge gateway (see
Part D; under A3 this is the Terraform-owned shared gateway, already live).

---

## Part D — Backend addition: the admin-only proving endpoint (FR-018)

> **A3 reconciliation (post-004-A3).** This Part D was written pre-A3; the committed reality: the
> back-office service lives at **`apis/edge-api/admin/`**, routes are **`/admin/v1/...`** (e.g.
> `/admin/v1/admin-ping`), the authorizer is **Terraform-owned at the shared gateway** and
> referenced **by id from SSM** (`/effy/<env>/edge/authorizer/back-office_id`), and **CORS is a
> gateway value** (`infra/envs/dev/edge-gateway.tf`), not a per-service setting. Deploy =
> `make edge-deploy SERVICE=admin ENV=dev`. The D1/D2 specifics below are updated accordingly.

**D1 — Shape.** One new route on the back-office cold-path service (`apis/edge-api/admin/`):
`GET /admin/v1/admin-ping`, behind the back-office JWT authorizer (A3: referenced by SSM id, not a
local authorizer), authorizing the **`admin`** group only (manager/csa → shared `forbidden`
problem). Mirrors `back-office-ping-v1-get.ts` but with `ADMIN_GROUPS = ["admin"]`. New handler
`apis/edge-api/admin/src/functions/back-office-admin-ping-v1-get.ts` + serverless function
`backOfficeAdminPingV1` + its 3 CloudWatch alarms (errors/throttles/duration-p95) matching the
existing pattern. Reuses `lib/claims` (`hasAnyGroup`) and `lib/http` (`forbidden`, `json`,
`preamble`) unchanged. *(US4 later upgrades the authz decision to the DB record — see Part F.)*

**D2 — CORS.** The console's dev origin `http://localhost:5173` is an allowed origin on the
**Terraform-owned shared gateway** (`infra/envs/dev/edge-gateway.tf` `cors_configuration.allow_origins`,
A3 — **already live**), so the locally-run console can call the service. Unapproved origins stay
refused (spec edge case). This is a `terraform apply` concern (already done), **not** a per-service
`corsOrigins` edit or a `edge-deploy` step.

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
lands in the existing `apis/edge-api/admin/`.

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
read (`GET /admin/v1/me`) upserts idempotently:
`INSERT ... ON CONFLICT (cognito_sub) DO UPDATE SET email=…, last_seen_at=now(), updated_at=now()`
— safe under concurrent first contact (no duplicate; the unique `cognito_sub` + `ON CONFLICT`
is the idempotency guarantee, mirroring 004's idempotent-consumer pattern). Roles are reconciled
from the token's `cognito:groups` into `admin.staff_role` in the same transaction (delete-absent
+ insert-present, or a small diff).

**F3 — Authorization decision reads the platform record (status + role) — the "not solely
Cognito" proof.** The admin-only gate (`GET /admin/v1/admin-ping`, FR-018) authorizes by
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
`/admin/v1/ping`** (token echo, no DB); US3's admin gate ships **role-claim-based**
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

---

## Part G — Default dashboard shell: shadcn `sidebar-07` block (Amendment D1, 2026-07-08)

Operator directive (verbatim in operator-directives.md): the bootstrapped console must land in a
**default dashboard layout** built from the shadcn **`sidebar-07`** block
(https://ui.shadcn.com/blocks#sidebar-07) — "install it and use it or … copy the code." Spec
FR-023 / US1 / SC-013. This is **presentation-only** (no backend/data/auth change). Decisions:

**G1 — What `sidebar-07` is.** A shadcn **block** (not a preset, not a single component): a
collapsible-**to-icon** sidebar shell = a sidebar with a brand/team header, a primary nav
(`nav-main`), a footer user menu (`nav-user`, a dropdown), plus an **inset** content area whose
header has a `SidebarTrigger` + a breadcrumb. It composes the `sidebar` primitive and its
dependency components. This maps 1:1 onto FR-023's "persistent collapsible side-nav rail + top
location bar + main content region."

**G2 — Acquisition: `shadcn add` (default) or copy — both are the "components copied per app"
model (research B3).** `pnpm dlx shadcn@latest add sidebar-07` resolves through the app's
`components.json` (base radix, preset `b2BnwlLOK`) and writes the block into
`apps/back-office/src/components/`. It pulls the **dependency components** the block needs:
`sidebar`, `sheet` (mobile drawer), `separator`, `tooltip` (collapsed-rail labels), `skeleton`,
`breadcrumb`, `dropdown-menu`, `avatar`, `collapsible`, plus the **`use-mobile`** hook. Copying the
block source by hand yields the identical result — use it only if the CLI add fights the monorepo
wiring (same fallback posture as B2's shadcn init). Pin nothing new at the npm level: these are
copied source files on the existing Radix/Tailwind-v4 stack, not new runtime deps (the only new
transitive Radix primitives, e.g. dropdown/avatar/tooltip/collapsible, arrive as shadcn-managed
peer installs, catalog-aligned like the rest of `components/ui`).

**G3 — Theming: block palette must NOT beat the design-system SSOT (Principle V).** shadcn blocks
render against CSS variables (`--sidebar`, `--sidebar-foreground`, …). Those variables must resolve
**from `packages/design-system`** (Jade `#0FB57E`/`#047857` + dark mode), not the block's shipped
defaults — same rule as B2/B3 for the init preset. Verify no hardcoded hex lands in the copied
files (SC-006/SC-009 hygiene grep already covers `apps/back-office/src`).

**G4 — Placement vs Effy conventions.** The block dumps composed files flat in `components/`; Effy
is feature-sliced (ARCHITECTURE admin-web). Resolution: the **primitives** stay in
`components/ui/` (shadcn's model, B3); the **composed chrome** (`AppSidebar`, `NavMain`, `NavUser`,
`AppHeader`) moves to **`components/layout/`** — it is app shell, not a `features/<domain>` slice
and not a shared cross-surface package yet (a future surface graduates shared chrome up per the B3
rule). `routes/app.tsx` hosts the composition.

**G5 — Replace demo data with real console state (no fake teams/projects).** The block ships with
placeholder teams, projects, and a user. Effy is **single-brand** (no team/org switcher — CLAUDE.md),
data-less bootstrap (no projects). So: the team switcher → a single **Effy Back-Office** brand mark;
`nav-main` → a small typed **nav model** filtered by the existing `isAdmin(roles)`/`requireGroup`
role logic (mechanic 2) so the Admin item is role-gated (FR-006/FR-023); secondary/projects nav
dropped; `nav-user` → the real verified identity + **Sign out** (`useSignOut`) + **theme toggle**
(the actions the pre-amendment header held, relocated). The breadcrumb derives from the active
route. *Rationale*: the shell reflects authoritative state, never invents a second source of truth.

**G6 — Sidebar collapsed/expanded is genuine client UI state.** `sidebar-07` persists its
open/collapsed bit (the block uses a cookie by default). Per Principle V/VI that bit is client-only
UI state → hold it in the TanStack Store `uiStore` (alongside `theme`), driving `SidebarProvider`'s
controlled `open`. Keeps "server-state in Query, client-state in the one store" honest and avoids a
second persistence mechanism. *Alternative* (block default cookie) rejected — it would be a
parallel, untyped client-state store outside the sanctioned one.

**G7 — What stays OUT.** No command palette / hotkeys wiring beyond the existing `lib/` seam (the
alpha Hotkeys stays trivially exercised — A2); no responsive/mobile-nav work beyond what the block
provides for free (`sheet` drawer + `use-mobile`); no per-nav-item icons beyond lucide (already a
dep). The shell is the frame; real navigational destinations arrive with real features.

---

## Part H — Neutral theme, single emerald accent (Amendment D2-a, 2026-07-09)

Operator directive: remove the green-tinted surfaces ("green-white" light / "green-black" dark blends on
the sign-in background, sidebar, hovers), follow the shadcn **`sidebar-07` neutral base**, keep **emerald
as the only accent**. Spec FR-024 / SC-014. Presentation-only, edited **once** in the design-system SSOT.

**H1 — Diagnosis.** The current `tokens.css` tints its *neutrals* with the brand green: `--accent`
`#e6f7f0`/`#063a2b` (the green hover the user dislikes), `--sidebar` `#f4f8f6`/`#111815`, greenish
`--secondary`/`--muted`/`--border`/`--input`, `--accent-foreground` `#047857`. shadcn's `sidebar-07`
example ships on a **neutral** base color (Tailwind `neutral` scale) — pure greys, no hue — with the brand
used only as `--primary`. The fix is to rebase every *surface* token onto neutral greys and keep only the
accent coloured.

**H2 — Decision: keep `#0FB57E` as the single accent; neutral everything else.** `--primary`, `--ring`,
`--sidebar-primary` stay Jade `#0FB57E` (an emerald shade → satisfies "emerald as primary" with no
constitution change). Every surface/hover token moves to the Tailwind `neutral` scale. The active nav item
(driven by `--sidebar-accent`) becomes a neutral highlight — faithful to `sidebar-07`.

**H3 — Pinned token values** (replace the current values in `packages/design-system/src/tokens.css`;
`@theme inline` mappings already exist from D1 — no wiring change):

| token | light (`:root`) | dark (`.dark`) | note |
|---|---|---|---|
| `--background` | `#ffffff` | `#0a0a0a` | neutral (was green-black in dark) |
| `--foreground` | `#0a0a0a` | `#fafafa` | neutral |
| `--card` / `--popover` | `#ffffff` | `#171717` | neutral elevated (dark) |
| `--card-foreground` / `--popover-foreground` | `#0a0a0a` | `#fafafa` | |
| `--primary` | `#0fb57e` | `#0fb57e` | **KEEP — the single accent (Jade/emerald)** |
| `--primary-foreground` | `#ffffff` | `#052e1b` | readable on emerald |
| `--secondary` / `--muted` | `#f5f5f5` | `#262626` | neutral (was greenish) |
| `--secondary-foreground` | `#171717` | `#fafafa` | |
| `--muted-foreground` | `#737373` | `#a1a1a1` | neutral grey (was green-grey) |
| `--accent` (hover) | `#f5f5f5` | `#262626` | **neutral — kills the green hover** |
| `--accent-foreground` | `#171717` | `#fafafa` | neutral (was `#047857`) |
| `--border` / `--input` | `#e5e5e5` | `#262626` | neutral |
| `--ring` | `#0fb57e` | `#0fb57e` | branded focus (accent) |
| `--sidebar` | `#fafafa` | `#171717` | neutral surface (was `#f4f8f6`/`#111815`) |
| `--sidebar-foreground` | `#0a0a0a` | `#fafafa` | |
| `--sidebar-primary` | `#0fb57e` | `#0fb57e` | brand mark / any primary use |
| `--sidebar-primary-foreground` | `#ffffff` | `#052e1b` | |
| `--sidebar-accent` (hover/active) | `#f5f5f5` | `#262626` | **neutral** |
| `--sidebar-accent-foreground` | `#171717` | `#fafafa` | neutral |
| `--sidebar-border` | `#e5e5e5` | `#262626` | neutral |
| `--sidebar-ring` | `#0fb57e` | `#0fb57e` | |

- `--destructive` unchanged. Values mirror shadcn's `neutral` base (Tailwind `neutral-100 #f5f5f5`,
  `neutral-200 #e5e5e5`, `neutral-500 #737373`, `neutral-800 #262626`, `neutral-900 #171717`,
  `neutral-950 #0a0a0a`, `neutral-50 #fafafa`). Confirm-at-implement against the live `sidebar-07` block.

**H4 — Governance (no constitution amendment).** Principle V: "Brand color is Jade `#0FB57E`; fill
`#047857`." `#0FB57E` is **retained** as primary/accent (emerald shade). Fill `#047857` stays a defined
brand token (available for a darker-jade state) but **no longer tints surfaces** — the constitution
requires the fill to *exist*, not to tint backgrounds. Principle V holds → **no amendment**. (Adopting the
literal Tailwind `emerald` hex `#10b981`/`#059669` instead of `#0FB57E` would be a token change **plus** a
Principle-V note — not done unless the operator asks.)

**H5 — Blast radius.** One file (`tokens.css`). Every surface — sign-in screen, dashboard shell, all
shadcn primitives — consumes these tokens (Principle V), so they all re-theme with **zero** component
edits. SC-007's `#0FB57E` hygiene grep still passes (brand only via the design-system). A cheap guard
test MAY assert no green-tinted surface hex remains in `tokens.css`.

---

## Part I — Proportional UI scaling on large / wide screens (Amendment D2-b, 2026-07-09)

Operator directive: on wide/large monitors components look small and the layout feels empty; scale them up
proportionally — laptop = normal, wide = bigger — and **"find the industry-standard way first."** Spec
FR-025 / SC-015. Researched live (2026-07-09).

**I1 — Industry-standard survey.** The modern standard for size-adapting UI is **fluid sizing** — a value
that scales continuously with the viewport, expressed with CSS **`clamp(min, preferred, max)`** where the
preferred term uses a viewport unit. It is the dominant approach in 2025–26 design-token pipelines
(Utopia, Style Dictionary, web.dev Baseline). Two granularities: **viewport-based** (`vw`) for
page-level scaling, and **container queries** for component-local scaling.

**I2 — Accessibility gotcha (decisive).** A **bare `vw`** font size does **not** respond to browser zoom /
user font preference → fails WCAG 1.4.4 (resize text). The fix is to **anchor the preferred term in `rem`**:
`clamp(1rem, 0.5rem + 1vw, 1.375rem)` still grows with the viewport **and** honours zoom. Any fluid rule we
ship MUST keep a `rem` term.

**I3 — Decision: scale the ROOT font-size (not per-component).** The enabling fact: **Tailwind v4 + shadcn
are fully `rem`-based** — the spacing scale (`--spacing`, so every `p-*`/`gap-*`/`h-*`), type sizes,
control heights, `--radius`, and `--sidebar-width: 16rem` are all `rem`. Therefore a **single rule on
`:root`/`html` font-size scales type, spacing, controls, and layout density *together*** — precisely "make
the components a bit bigger" — with **zero** per-component edits. This is the lowest-risk, highest-coverage
technique and the right fit for a whole-dashboard scale-up.
- **Rule**: `:root { font-size: clamp(1rem, <rem + vw>, ~1.375rem) }`, tuned so it equals the **laptop
  baseline (16px) up to a large-width threshold (~`2xl` = 1536px)** and scales up **above** it, **capped**
  for ultrawide. Baseline (small/laptop) is **unchanged** (FR-025). Tailwind's px breakpoints are
  unaffected (they don't depend on root font-size), so layout structure holds while sizes grow.
- **Alternative (recorded, also standard)**: stepped media queries —
  `:root{font-size:16px} @media(min-width:1536px){:root{font-size:17px}} @media(min-width:1920px){:root{font-size:18px}} @media(min-width:2560px){:root{font-size:20px}}`.
  Simpler and trivially testable (stepped), less smooth. Either is acceptable; **`clamp` chosen** for
  smoothness with the stepped form as the fallback if the curve needs tuning.
- **Rejected**: per-component `clamp()` on dozens of shadcn components (huge surface, misses spacing);
  container queries (component-local — overkill for a uniform page-level scale-up this slice; revisit for
  reusable data components later).

**I4 — Guard against over-stretch.** Root scaling grows sizes but very wide viewports still risk over-long
line lengths → cap the **main content region** with a large centered `max-width` (a layout class on the
`SidebarInset` content wrapper in `routes/app.tsx`). This is the one component touch D2 allows; the sidebar
stays fixed-`rem` width (it scales via the root font-size like everything else).

**I5 — Placement.** The root-font-size rule + the max-width utility live in the **design-system**
(`tokens.css` or a sibling `scale.css` it imports) so **every** surface (sign-in + shell) inherits it. Pure
CSS — **no JS, no new client state** (the `uiStore` is untouched). Verification is visual (SC-015) via the
screenshot harness at laptop / wide / ultrawide widths.

**Sources** (Part I): [web.dev — fluid type with Baseline CSS](https://web.dev/articles/baseline-in-action-fluid-type) ·
[LogRocket — fluid vs responsive typography with clamp](https://blog.logrocket.com/fluid-vs-responsive-typography-css-clamp/) ·
[Hoverify — fluid typography with Tailwind + clamp](https://tryhoverify.com/blog/fluid-typography-tricks-scaling-text-seamlessly-across-devices-with-tailwind-and-css-clamp/).
