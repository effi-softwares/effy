# Effy (CLAUDE.md)

Effy is a **single-brand, vertically-integrated grocery + e-commerce delivery platform**. We build
it **spec-first** using **GitHub Spec Kit**. Read this before doing anything.

## What Effy is (the product model)
- Customers buy from **one brand: "Effy."** There is no marketplace of named storefronts.
- **Shops are hidden internal fulfillment nodes** (dark-store-like). Customers never see or pick a
  shop — the platform decides fulfillment behind the scenes.
- **Drivers and back-office staff are Effy employees**, working in internal apps (no public signup).
- Four audiences, each with its own trust level: **customer, driver, shop/operator, admin/back-office.**

## Platform shape (the vision)
The full platform is **six client surfaces + two backends + DB migrations + infrastructure**. The
customer and shop audiences each get **two surfaces kept at parity** (a native mobile build and a
native web build).

- **Mobile (3):** `customer` / `driver` / `shop` — Kotlin Multiplatform + Compose Multiplatform
  (shared iOS/Android), **Clean Architecture + MVVM**, Ktor client, AWS Amplify (Cognito).
- **Web (3):** `customer-web` (Next.js 16 SSR, customer storefront), `shop-web` (Vite SPA, shop
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
- **Region: `ap-southeast-2` (Sydney).** Moved from `ap-southeast-1` (Singapore) on 2026-07-12 — dev
  was destroyed and re-provisioned from scratch (no data kept), and the Terraform state bucket moved
  with it (`effy-apse2-tfstate`). `ap-southeast-1` is empty. Region is config, never a literal: it
  flows from `var.aws_region` / the `/effy/<env>/region` SSM contract. **Three values pin a region
  outside Terraform** and must be changed by hand on any future move — the Lambda
  Parameters-and-Secrets **layer ARN** (its AWS-owned account id differs per region), the embedded
  **RDS CA bundle** (`apis/edge-api/shared/src/lib/rds-ca.ts`, region-rooted chain), and each
  `serverless.yml` `provider.region`. Runbook: [infra/envs/README.md](infra/envs/README.md).
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
AWS Cognito, **four isolated pools**: customer / driver / shop / admin. **All four pools use
passwordless EMAIL_OTP** (no passwords anywhere). Driver / shop / admin are admin-provisioned (no
self-signup). **Pools MAY define RBAC groups** surfaced via the `cognito:groups` JWT claim: the
admin pool defines `admin` / `manager` / `csa`; the shop pool defines `shop_manager` /
`shop_staff`; customer and driver define none. The claim is the **origin of role assignment**;
where a platform staff record exists it is **authoritative for the access decision** (role, status,
scope). Frontends authenticate against Cognito directly via Amplify; backends
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
- `apps/shop-mobile` — `com.effyshopping.shop.mobile` — the shop-operator app (the "shop" audience;
  the mobile app is named `shop`).

Baseline stack: **Kotlin 2.4.0, Compose Multiplatform 1.11.1, AGP 9.0.1, minSdk 24 /
compileSdk + targetSdk 36**. All three are currently the base KMP template (commonMain
`Greeting`/`Platform` stubs); each feature's stack is layered in per that feature's plan/tasks.

## Current status
Built so far: the **infrastructure** (four Cognito pools, dev DB, shared HTTP gateway), the
**migration workflow**, the **cold path** (`apis/edge-api/{shared,admin,shop}`), and **two web
surfaces** — `apps/back-office` (005) and `apps/shop-web` (007) — on the shared packages
`@effy/{design-system,shared-types,api-client,web-kit}`. The **three KMP mobile apps remain the base
template**; `customer-web`, the hot path's product features, and the event backbone are still the
**documented vision**. Everything gets built **slice by slice**, each driven by its own spec → plan →
tasks. Don't build all surfaces in parallel: one vertical slice proves the foundation before the
pattern scales.

## Active feature

**009-shop-management** — Back-Office Shop Management. **Code-complete + verified; operator run pending.**
The platform's shop-management capability in the **back-office** console: create shops, govern their
lifecycle (active/suspended/disabled), and manage the people at each shop — provisioning shop users
as passwordless **shop-pool** Cognito accounts + the platform record, kept consistent. It makes shop
and shop-user existence **product data** and so **completes 007's deferred live sign-off** (SC-005b,
SC-012 → this slice's SC-007/SC-008).
- **Backend (cold path)**: a new `shops/` slice in **`apis/edge-api/admin`** (back-office authorizer)
  — `/admin/v1/shops...` (list/detail/audit + create/update/status/delete + roster create/update).
  Server-side Cognito Admin provisioning of shop-pool users follows 006's Cognito-first→DB idempotent
  pattern (IAM scoped to the shop pool ARN; an authorized provisioning write, **not** cross-pool
  auth — Principle IV holds, research R3). Two authz gates from the `admin.staff` record: read = any
  active staff (incl. `csa`); mutate = `admin`/`manager` (A1).
- **Data**: one forward-only migration (`20260710060000_shop_management.sql`) — `public.shop` gains a
  3-value `status` (replacing 007's `is_active`) + `contact_phone`/`notes`; new general
  **`admin.audit_log`**. The **007 shop manager gate was reconciled** to `status = 'active'` in
  lockstep with its tests (research R2).
- **Frontend**: a `features/shops/` slice in `apps/back-office` on the shared foundation; CRUD
  primitives the design-system lacked (`table`/`dialog`/`alert-dialog`/`select`/`badge`) + a generic
  `DataTable` in `@effy/web-kit/console` were added **to the packages** (Principle II); management
  DTOs added to `@effy/shared-types`; `api-client` gained `post`/`patch`/`delete`.
- Status: **code-complete** — full workspace `pnpm typecheck` + `pnpm -r test` (**184 tests**:
  edge-shared 26, edge-admin 31 [+24 new `shops`], edge-shop 39, web-kit 38, back-office 21,
  shop-web 29) + `turbo build` all green; secret/PII sweep clean. **Open (operator)**: **T067**
  (`make apply ENV=dev` — Cognito IAM + `SHOP_USER_POOL_ID`), **T068** (commit migration + `make
  db-up ENV=dev`), **T069** (`make edge-deploy SERVICE=admin` + `SERVICE=shop ENV=dev`), **T070**
  (live SC-001…SC-015 incl. 007 sign-off closure), **T071** (parity-doc + sign-off).
  Spec/plan/artifacts: [specs/009-shop-management/](specs/009-shop-management/).

**007-shop-web** — Shop Web Foundation (Bootstrap). **Code-complete + verified; operator run pending.**
The platform's **second web surface**: `apps/shop-web` (`@effy/shop-web`, Vite + React 19 SPA on
:5174), the shop operator console. Same stack as the back-office console, **shop** Cognito pool,
and the shop audience's **first RBAC model**.
- **Constitution amended → v1.5.0**: Principle IV generalized from "the admin pool defines RBAC
  groups" to "pools MAY define RBAC groups"; the **shop pool gains `shop_manager` / `shop_staff`**.
  The claim is the *origin* of role assignment; the platform record is *authoritative for the access
  decision*.
- **Shared-foundation extraction** (the slice's core work, Principle II): the reusable half of the
  back-office console moved into packages — **`@effy/design-system/ui`** (the platform's one set of
  13 shadcn primitives + `use-mobile`) and a new **`@effy/web-kit`** (`.` = config · Amplify ·
  EMAIL_OTP flow · session guard · query client · telemetry · client store; `./console` = the SPA
  chrome: `ConsoleShell` / sidebar / header / user menu / `NavList` / `OtpSignInCard` / `ErrorState`,
  all generic over the surface's role union). `back-office` was refactored onto both and stayed
  **20/20 green**. **`@effy/api-client` needed no change at all** — the cleanest evidence the
  foundation was already audience-neutral (SC-009).
- **Data**: the platform's **first `public`-schema tables** — `shop`, `shop_staff`, `shop_role`,
  `shop_staff_role` (migration `20260710050004`). `shop_staff.email` and `.shop_id` are nullable
  by design; **status and shop assignment are platform-owned and never written from token data**.
  **No shop-creation path ships** (FR-019, revised 2026-07-10): no interface, no command, no seed
  file. `public.shop` is created empty and stays empty until **back-office shop management** — the
  **next slice** — fills it, so no shop row ever exists that the product did not create.
- **Backend** (`apis/edge-api/shop`, restructured to nested domains `staff/` + `status/`):
  `GET /shop/v1/me` (record-backed identity read + idempotent JIT upsert) and
  `GET /shop/v1/manager-ping` (**gate = role AND status AND shop scope**, one SQL predicate,
  fail-closed, uniform 403 that never discloses which term failed).
- **Parity**: [docs/audiences/shop-capabilities.md](docs/audiences/shop-capabilities.md) is the
  single register binding `shop-web` ↔ `shop-mobile`; the mobile column is **outstanding by design**
  (building it is its own slice).
- Spec/plan/artifacts: [specs/007-shop-web/](specs/007-shop-web/).
- **Verification**: `scripts/` holds the three checks that cannot honestly be unit-tested —
  `make shop-verify-isolation` (SC-004, gateway authorizers), `make shop-verify-gate` (SC-005/005a,
  a SQL join), `make shop-token-claims` (research R6).
- Status: **code-complete** — `pnpm typecheck` + `pnpm test` green across the workspace (**159
  tests**: edge-shared 26, edge-admin 7, edge-shop 39, web-kit 38, back-office 20, shop-web 29);
  `terraform validate` + `fmt` clean; shellcheck clean; secret/PII sweep clean. **Open (operator)**:
  **T009** (`make apply ENV=dev` — 2 Cognito groups + the `:5174` CORS origin; *abort if the pool
  would be replaced*), **T012** (commit the migration, then `make db-up ENV=dev`), **T034**
  (provision three shop accounts in Cognito + sign in), **T041** (`make edge-deploy SERVICE=shop
  ENV=dev`), **T045** (`make shop-verify-isolation` — expect `200 200 401 401`), **T054**/**T060**
  (`make shop-verify-gate` — the gate's negative half), **T068** (`make shop-token-claims` → settle
  research R6), **T070** (partial SC sign-off).
  Runbook: [quickstart](specs/007-shop-web/quickstart.md).
- **Sign-off is partial by design.** **SC-005b** (a manager *served* at an active shop; refused once
  it is deactivated) and **SC-012** (a *disabled* operator refused) need shop data only the
  back-office shop-management slice can create. All three gate terms are implemented + unit-tested
  here; the role and shop-scope terms are additionally proven **live** (an unassigned
  `shop_manager` is refused despite a valid claim — FR-021 in one line).
- **Raised, not fixed**: `/admin/v1/me` (005) resolves email as `claim("username") ?? sub` and may be
  storing UUIDs in `admin.staff.email`. Recorded at the tail of
  [specs/005-back-office-web/plan.md](specs/005-back-office-web/plan.md); 007 deliberately does not
  inherit the pattern (research R6).

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
- `apis/core-api` (hot path — Go, local Docker only) + `apis/edge-api/{shared,admin,shop}`. The
  shared library graduated to **`@effy/edge-shared`** (Principle II single-source); `admin`
  (back-office pool) and `shop` (shop pool) each **attach to a Terraform-owned shared HTTP API**
  (`infra/envs/dev/edge-gateway.tf`) via `provider.httpApi.id` and reference the four per-pool JWT
  authorizers **by id** from SSM (`/effy/<env>/edge/{http_api_id,api_endpoint,authorizer/*}`). Path
  scheme **`/<service>/v1/...`** (e.g. `/admin/v1/me`, `/shop/v2/status`). Adding a service = a new
  `apis/edge-api/<name>/` that attaches to the gateway — deploy-independent.
- Spec + plan revised **in place** (amendment **A3**, research **Part F**, `contracts/shared-gateway.contract.md`);
  tasks **Phase 9 (T049–T059)**. Status: **deployed to dev** — gateway applied, `admin`+`shop`
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
  shell is a shadcn **`sidebar-07`** dashboard layout; sidebar tokens in `@effy/design-system`,
  collapse bit in `ui-store.sidebarOpen` (controlled — no cookie). **Presentation-only** (no
  backend/data/auth change). Built + verified; no operator/cloud step.
  **⚠ Relocated by 007**: the chrome no longer lives in `apps/back-office/src/components/layout/`
  and the primitives no longer live in `components/ui/`. `routes/app.tsx` now renders
  **`<ConsoleShell>` from `@effy/web-kit/console`**, fed this surface's brand + nav config; the
  primitives are **`@effy/design-system/ui`**. Only `components/layout/nav.ts` remains app-local.
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
at specs/009-shop-management/plan.md
<!-- SPECKIT END -->
