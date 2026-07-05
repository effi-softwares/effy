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
  Tailwind v4, TanStack Query/Router, Zustand (customer-web), AWS Amplify.
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

**004-backend-bootstrap** — Backend Service Foundations (Dual-Path Bootstrap).
Bootstrap both backend services: **`core-api`** (hot path — Go + Gin + pgx/v5;
latency-critical, high-traffic customer reads; **local Docker only this slice**, Fargate
later) and **`edge-api`** (cold path — Serverless Framework v3 + TypeScript Lambdas behind
API Gateway; latency-tolerant, cost-over-speed ops/profile/back-office; **deploys to dev
now**, operator-run). Both strictly Clean Architecture per ARCHITECTURE.md (thin edge →
service → repository, raw SQL, explicit wiring), each with a health check (liveness vs
dependency readiness) + a proving endpoint traversing all three layers to the dev DB,
per-pool JWT enforcement (cross-pool tokens structurally rejected), one shared error
contract, structured correlated logs (+ `/metrics` on core), and **every non-health
endpoint explicitly versioned** with side-by-side version coexistence (mobile fleets can't
be force-updated). Ships conventions docs + the hot/cold path-assignment rule.

- Spec: [specs/004-backend-bootstrap/spec.md](specs/004-backend-bootstrap/spec.md)
  (+ binding [operator-directives.md](specs/004-backend-bootstrap/operator-directives.md)
  — pinned stacks and the internet-research mandates, incl. industry API-versioning
  research)
- Plan: [specs/004-backend-bootstrap/plan.md](specs/004-backend-bootstrap/plan.md)
  (+ research.md, data-model.md, contracts/, quickstart.md, tasks.md)
- Status: **implemented (code complete, 40/48 tasks)** — `services/core-api` (Go 1.25 +
  Gin: platform layer, per-pool JWT verifiers, RED metrics, healthz/readyz, v1+v2
  platform-status + customer ping; build/vet/gofmt clean, unit + testcontainers tests
  green) and `services/edge-api` (serverless 3.40.0 pin, nodejs22.x/arm64, HTTP API with
  four per-pool JWT authorizers, pg max-1 pool + runtime secret fetch, pino, alarms;
  tsc clean, vitest 31/31, turbo green); pnpm workspace + turbo activated; `docs/api/`
  contracts + both service READMEs shipped; Makefile `core-*`/`edge-*` targets; hygiene
  sweep clean. **Open — the operator sitting** (tasks.md Implementation notes): FIRST the
  002 allowlist apply, then T020 (live `make core-run`), T027 (first `make edge-deploy
  ENV=dev`; confirm secrets-extension layer version), T035 (token matrix), T039 (live
  v1/v2/v3 checks), T043 (newcomer exercise), **T046 (ratify Node 22 constitution
  PATCH)**, T047 (quickstart SC-001…SC-010 sign-off), T048 (commit the slice).

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
at specs/004-backend-bootstrap/plan.md
<!-- SPECKIT END -->
