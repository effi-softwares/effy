# Effy (CLAUDE.md)

Effy is a **single-brand, vertically-integrated grocery + e-commerce delivery platform**. We build
it **spec-first** using **GitHub Spec Kit**. Read this before doing anything.

## What Effy is (the product model)
- Customers buy from **one brand: "Effy."** There is no marketplace of named storefronts.
- **Stores are hidden internal fulfillment nodes** (dark-store-like). Customers never see or pick a
  store — the platform decides fulfillment behind the scenes.
- **Drivers and back-office staff are Effy employees**, working in internal apps (no public signup).
- Four audiences, each with its own trust level: **customer, driver, store/operator, admin/back-office.**

## Platform shape (the vision)
The full platform is **six client surfaces + two backends + DB migrations + infrastructure**. The
customer and store audiences each get **two surfaces kept at parity** (a native mobile build and a
native web build).

- **Mobile (3):** `customer` / `driver` / `shop` — Kotlin Multiplatform + Compose Multiplatform
  (shared iOS/Android), **Clean Architecture + MVVM**, Ktor client, AWS Amplify (Cognito).
- **Web (3):** `customer-web` (Next.js 16 SSR, customer storefront), `store-web` (Vite SPA, store
  operator console), `back-office` (Vite SPA, internal admin) — React 19 + TypeScript, shadcn/ui +
  Tailwind v4, the TanStack suite (Router/Query/Table/Form/Store/Virtual/DevTools/Hotkeys),
  client state via TanStack Store (no Zustand; constitution v1.4.0), AWS Amplify.
- **Backend — dual path:**
  - **Hot path:** Go + Gin + pgx/v5 on Fargate (ARM64) — latency-sensitive customer reads &
    transactions (catalog, profile, addresses, orders/checkout when built).
  - **Cold path:** Node + TypeScript Lambdas (Serverless Framework v3) — ops/admin/operator CRUD and
    async/event workers.
  - **Event backbone:** both backends publish domain events to one SNS topic; per-consumer SQS queues
    subscribe with filter policies (the fulfillment fan-out).
- **Data:** PostgreSQL 16, **raw SQL**, Goose migrations, **no ORM.** Two schemas: `public`
  (operational) and `admin` (back-office accounts + audit).
- **Infra:** Terraform, multi-env, remote state (S3 + DynamoDB lock). AWS-native: Cognito, RDS,
  ECS/ECR, Lambda, S3, SNS/SQS, SES, Amplify Hosting.
- **Observability & telemetry:** Prometheus + Grafana (metrics/dashboards/alerts, self-hosted on
  ECS); Crashlytics (mobile crash reporting); PostHog (product analytics + web error tracking on all
  clients); push via FCM (+ APNs for iOS) through the notifications path.

## Architecture rule
**Clean Architecture everywhere.** In the KMP apps, the presentation layer is **MVVM**
(`ViewModel` + lifecycle-aware state, coroutines/Flow). Cross-cutting concerns (types, design
tokens, API client, config) are **shared packages** — the single source of truth — never copy-pasted
per surface.

## Architecture (the spine)
Every surface is organized the same way internally. The full, **binding** reference is
[ARCHITECTURE.md](ARCHITECTURE.md) (constitution Principle VI) — read it before building any feature.
The spine in five rules:
- **Three-layer slice per feature:** thin edge (handler / UI) → service / use-case → repository.
  Clean-Architecture direction — domain depends on nothing, data implements it, presentation consumes it.
- **Repository pattern, raw SQL, no ORM.** Wire shapes (DTOs / rows) are mapped explicitly to domain
  models and never leak past the data layer.
- **No DI framework** — dependencies are wired explicitly and greppably (by hand at the entry point,
  one mobile container, or cached module singletons).
- **Unidirectional client state** — mobile MVVM (immutable State + typed Intents + one-off Effects);
  web treats the server-state cache as the source of truth, with a client store only for genuine
  client state. Never hand-cache server data in component state.
- **One event language across backends** — both publish the same event envelope; consumers are idempotent.

## Observability & telemetry
Observable and measurable from day one (constitution Principle VII; full detail in
[ARCHITECTURE.md](ARCHITECTURE.md)):
- **Backends:** structured logs + a `/metrics` endpoint (Prometheus) → Grafana dashboards & alerts;
  Lambda metrics via CloudWatch into the same Grafana.
- **Mobile:** Crashlytics crash reporting via a `core/platform/` native driver.
- **Clients (all six):** PostHog product analytics through a shared, typed event taxonomy; web apps
  also route runtime errors to PostHog. No PII in telemetry beyond the auth subject id; analytics is
  consent-respecting.
- **Push:** device tokens registered via the hot path; the notifications worker sends push (FCM/APNs)
  alongside email — never ad hoc per feature.

## Decisions locked
- **Repo shape:** MONOREPO (Turborepo + pnpm for JS/TS; Go lives alongside with its own module; each
  KMP app is its own Gradle build). Reason: solo/small team → consistency across surfaces is the #1
  need; shared packages (design-system, api-client, shared-types, config) are the whole point.
- **Methodology:** Spec Kit (official CLI), with a product Brief up front.
- **Mode of work:** Claude WRITES all the code — scaffolding plus app/service/infra source, task by
  task per the plan. The USER runs every risky / outward-facing operation manually: deployments,
  `terraform apply`/`tf-bootstrap`, DB migrations, and anything touching live AWS. Claude authors
  Terraform, migration SQL, and Lambda source but does NOT run `terraform apply`, migrations, or any
  command that provisions cloud resources or mutates live state — it hands those steps to the user
  with exact commands to run.

## Workflow (the method)
```
Brief (product framing, user-authored)  →  /constitution (technical law, once)
   →  /specify <feature>  (WHAT/WHY, zero tech)
   →  /plan <feature>     (HOW, tech, cites constitution)
   →  /tasks <feature>    (ordered, checkable)
   →  /implement          (build task by task, verify vs acceptance criteria)
```
Discipline: specs have ZERO tech. A gap found later sends you BACK to fix the earlier artifact.

## Order of operations
1. The **Brief** (platform-brief.md) captures the product.
2. **/constitution** encodes the technical law (dual-path, monorepo, no-ORM, native-feel mobile,
   Jade brand #0FB57E / fill #047857, 4-pool auth isolation with passwordless EMAIL_OTP).
3. First slice: **Auth + customer onboarding** end-to-end (proves 4-pool auth + dual-path +
   monorepo, and unblocks everything else). Catalog browse is the recommended second slice.
4. Do NOT pre-build the monorepo scaffold ahead of the specs — let each feature's plan drive what
   gets scaffolded.

## Auth
AWS Cognito, **four isolated pools**: customer / driver / store / admin. **All four pools use
passwordless EMAIL_OTP** (no passwords anywhere). Driver / store / admin are admin-provisioned (no
self-signup); the admin pool defines RBAC groups (admin / manager / csa) surfaced via the
`cognito:groups` JWT claim. Frontends authenticate against Cognito directly via Amplify; backends
validate JWTs per pool and pin the issuer — there is **no auth proxy**, and a token issued for one
pool is structurally rejected by services scoped to another.

## Design system (one source of truth)
Jade brand **#0FB57E** / fill **#047857**, shared across all surfaces via one design-system package.
**Dark mode required.** Mobile must feel native (iOS HIG / Android Material); fat-finger touch
targets + micro-animations are requirements, not optional polish. Design refs: Uber / Bolt /
foodpanda / eBay.

## Mobile apps (scaffolded)
Three KMP + Compose Multiplatform apps live under `apps/`, each an **independent Gradle build** with
the standard three-module layout (`shared` + `androidApp` + `iosApp`) and package root
`com.effyshopping.<app>.mobile`:
- `apps/customer-mobile` — `com.effyshopping.customer.mobile` — the customer shopping app.
- `apps/driver-mobile` — `com.effyshopping.driver.mobile` — the driver delivery app.
- `apps/shop-mobile` — `com.effyshopping.shop.mobile` — the store-operator app (the "store" audience;
  the mobile app is named `shop`).

Baseline stack: **Kotlin 2.4.0, Compose Multiplatform 1.11.1, AGP 9.0.1, minSdk 24 /
compileSdk + targetSdk 36**. All three are currently the base KMP template (commonMain
`Greeting`/`Platform` stubs); each feature's stack is layered in per that feature's plan/tasks.

## Current status
Only the **three KMP mobile apps are scaffolded** today (base KMP template). The web apps, the two
backends, the database, and the infrastructure described above are the **documented vision** — they
get built **slice by slice**, each driven by its own spec → plan → tasks. Don't build all surfaces in
parallel: one vertical slice proves the foundation before the pattern scales.

## Active feature

**006-first-admin-bootstrap** — First Admin Bootstrap (Operator Break-Glass). **Code-complete +
verified; operator run pending.**
An **operator-run Go CLI** (+ `make create-first-admin EMAIL=… NAME=… ENV=dev`) that establishes the
**first back-office super-admin** out-of-band — **no API, no UI** (breaks the chicken-and-egg: the
console needs an admin, and privileged audiences forbid self-signup). It does two consistent writes:
`AdminCreateUser` **with no password** (→ `CONFIRMED`, `SUPPRESS` invite, `email_verified`) +
`AdminAddUserToGroup('admin')` in the back-office pool (001), and an idempotent upsert of
`admin.staff`(active)/`admin.staff_role('admin')` keyed on the returned **`sub`** (the 005 gate's
join key). Idempotent / break-glass. Adds one migration (`admin.staff.name`). Lives in
`apis/core-api` (`cmd/create-first-admin` + `internal/adminbootstrap`) — **reuses** its already-wired
Cognito SDK + pgx, **zero new deps**.
- Spec/plan/artifacts: [specs/006-first-admin-bootstrap/](specs/006-first-admin-bootstrap/).
- Status: **code-complete** — build/vet/gofmt clean, `make core-test` green (adminbootstrap unit
  tests + the 004 suite), hygiene clean, no new API/UI surface. **Open (operator)**: **T009** (`make
  db-up ENV=dev` + `make create-first-admin …` → sign in), **T013** (re-run/break-glass/bad-input),
  **T017** (SC-001…SC-006 sign-off + commit). *Not committed yet.* `db-up` needs the migration
  committed first (003 commit-guard).

**004-backend-bootstrap — A3 cold-path decomposition** (**implemented + live in dev**). The cost-optimized path is now a family of **independently deployable domain services
behind ONE shared HTTP API**, and the backends live under **`apis/`**:
- `apis/core-api` (hot path — Go, local Docker only) + `apis/edge-api/{shared,admin,store}`. The
  shared library graduated to **`@effy/edge-shared`** (Principle II single-source); `admin`
  (back-office pool) and `store` (shop pool) each **attach to a Terraform-owned shared HTTP API**
  (`infra/envs/dev/edge-gateway.tf`) via `provider.httpApi.id` and reference the four per-pool JWT
  authorizers **by id** from SSM (`/effy/<env>/edge/{http_api_id,api_endpoint,authorizer/*}`). Path
  scheme **`/<service>/v1/...`** (e.g. `/admin/v1/me`, `/store/v2/status`). Adding a service = a new
  `apis/edge-api/<name>/` that attaches to the gateway — deploy-independent.
- Spec + plan revised **in place** (amendment **A3**, research **Part F**, `contracts/shared-gateway.contract.md`);
  tasks **Phase 9 (T049–T059)**. Status: **deployed to dev** — gateway applied, `admin`+`store`
  live, old `effy-edge-api` stack removed. `turbo` **14/14**, core-api Go build+tests, `terraform
  validate`, hygiene sweep — all green. Committed (`aacd7c5`).

**005-back-office-web** — Back-Office Web Foundation (Bootstrap). **Phases 1–8 + Amendment D1
(dashboard shell) + Amendment D2 (neutral theme + responsive scaling) implemented; reconciled to A3.
Live SC sign-off (T046) pending; not yet committed.**
The platform's **first web surface**: the internal `back-office` admin console (Vite + React 19
SPA) + the **first shared web packages** (`@effy/design-system`, `@effy/shared-types`,
`@effy/api-client`). Passwordless **EMAIL_OTP** (Amplify v6) → session-guarded shell → record-backed
identity read → **backend-authoritative** admin gate decided from the DB record (status + role).
Adds the platform's **own** back-office staff/RBAC system of record (`admin.staff`/`role`/`staff_role`
— the first real tables + first `db-up`) so RBAC does not rely solely on Cognito.
- Constitution amended: **v1.3.1** (Node 22) + **v1.4.0** (TanStack Store locked; Zustand removed).
- Post-A3: its `edge-api` work lives in **`apis/edge-api/admin/`**; the console calls
  **`/admin/v1/me`** + **`/admin/v1/admin-ping`** against the shared gateway
  (`VITE_API_BASE_URL` = `/effy/dev/edge/api_endpoint`).
- **Amendment D1 — default dashboard shell** (spec FR-023 / US1 / SC-013): the authenticated
  shell is now a shadcn **`sidebar-07`** dashboard layout — `routes/app.tsx` renders
  `SidebarProvider → AppSidebar + SidebarInset(AppHeader + Outlet)`; chrome in
  `apps/back-office/src/components/layout/` (`AppSidebar`/`NavMain`/`NavUser`/`AppHeader`/`nav.ts`),
  shadcn primitives in `components/ui/`, sidebar tokens in `@effy/design-system`, collapse bit in
  `ui-store.sidebarOpen` (controlled — no cookie). **Presentation-only** (no backend/data/auth
  change). **Built + verified**: app vitest **18/18** (6 new: nav filter, sidebar toggle, NavUser
  identity), typecheck + `build` clean, brand-hex hygiene clean. No operator/cloud step.
- **T058 done** — the shell (SC-013/SC-006) is **visually verified** via a seeded-session
  screenshot harness (light/dark × admin/manager × expanded/collapsed): dashboard layout,
  icon-rail collapse with reflow, role-aware nav (manager loses the Admin item), footer identity,
  on-brand jade in both appearances. Harness removed after capture.
- **Amendment D2 — neutral theme + responsive scaling** (FR-024/FR-025, SC-014/SC-015):
  **built + verified.** **(1)** surfaces rebased to neutral in `@effy/design-system` `tokens.css`
  (shadcn `sidebar-07` neutral base); **Jade `#0FB57E` kept as the single accent** — primary/ring/
  brand mark only (dark-on-emerald foreground for WCAG contrast); the green sign-in-bg / sidebar /
  hover blends are gone, light **and** dark. **(2)** fluid root-font-size scaling in a new
  `design-system/scale.css` (`clamp()`, rem-anchored/zoom-safe) → the whole rem-based UI scales
  proportionally on wide displays; 16px baseline to ~1536px, up to ~22px by ~2560px; + a
  `max-w-[1800px]` content cap in `routes/app.tsx`. **No constitution amendment** (Jade is an
  emerald shade — Principle V holds; governance in plan § Amendment D2). Phase 10 (T059–T063) all
  `[x]`; app vitest **20/20** (+2 token guard), typecheck/build clean; **visually verified** via the
  screenshot harness (neutral surfaces + emerald accent light/dark; proportional scaling
  1440→2560). Presentation-only, design-system-scoped.
- Open: **T046** — the LIVE SC-001…SC-013 sign-off (real OTP sign-in, live proving reads/denials,
  disabled-staff denial) is **operator-run** and gated on the still-open cloud steps **T022/T029/T038**
  (`make db-up ENV=dev` — migration `3407603` is committed so this is unblocked — then `make
  edge-deploy SERVICE=admin ENV=dev`, provisioned admin/manager/role-less accounts, an OTP inbox).
  Runbook: [quickstart](specs/005-back-office-web/quickstart.md). Everything code-verifiable is green.
- Doc reconciliation (2026-07-08): plan/tasks/research/data-model/contracts corrected to the A3
  reality (`apis/edge-api/admin`, `/admin/v1/*` paths, gateway-owned CORS, `make edge-deploy
  SERVICE=admin`) — closes the Governance drift the analyze pass flagged.

**Previous slices** (docs in `specs/<slice>/`):
- **001-infra-foundation** (four Cognito pools, EMAIL_OTP, state backbone, Makefile):
  **applied & verified in dev**. Open: operator OTP sign-in test (T023), sign-off (T035).
- **002-dev-database** (`effy-dev-db` — t4g.micro/20GB gp3, all paid options off ≈$22/mo,
  `/effy/dev/db/*` contract): **applied; posture verified live** (12/12 cost-posture rows).
  Open: operator allowlist apply + contract connect test (T008/T009), lever preview (T014),
  sign-off (T017; billing check due early Sept 2026).
- **003-db-migrations** (Goose workflow — `db/migrations/`, SQL-only timestamped files,
  Makefile `db-new`/`db-status`/`db-up`/`db-down`, DSN composed at invocation from the 002
  contract, forward-only with dev-only single-step down; proving migration = `admin` schema
  shell): **implemented; guards + hygiene verified; `make lint` green**. Open (operator
  sitting per [quickstart.md](specs/003-db-migrations/quickstart.md)): FIRST the pending
  002 allowlist apply (`make apply ENV=dev`), then commit the migration files, then
  T007-finish/T008 (db-status + first db-up), T010, T012, T015.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/007-shop-web/plan.md
<!-- SPECKIT END -->
