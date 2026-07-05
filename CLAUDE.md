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

<!-- SPECKIT START -->
## Active feature

**002-dev-database** — Cost-Minimized Development Database.
Provision the platform's PostgreSQL 16 operational database in **dev** at the cost floor:
RDS `db.t4g.micro` (ARM, on-demand), 20 GB gp3, single-AZ, **every separately-billed option
off** (no PI/advanced Insights, no Enhanced Monitoring, backups retention 0, no snapshot
exports, no RDS Proxy, no Extended Support exposure) — target ≈ US$22/mo (≤ $25 ceiling).
Default VPC + strictly allowlisted SG + forced TLS (the $0 network); master password
RDS-managed in Secrets Manager (never in TF state); connection config published to SSM
`/effy/dev/db/*`. Every cost lever is a reversible tfvars flip with a grow-later runbook.
Claude authors IaC; the operator runs every apply.

- Spec: [specs/002-dev-database/spec.md](specs/002-dev-database/spec.md) (+ binding
  [operator-directives.md](specs/002-dev-database/operator-directives.md))
- Plan: [specs/002-dev-database/plan.md](specs/002-dev-database/plan.md)
- Research / data-model / contracts / quickstart: `specs/002-dev-database/`
- Tasks: [specs/002-dev-database/tasks.md](specs/002-dev-database/tasks.md)
- Status: **implemented** — module + dev wiring authored; `terraform validate`, `make lint`,
  and the static cost-posture assertion all clean; plan previews exactly 9 adds. Remaining:
  operator-run steps per [quickstart.md](specs/002-dev-database/quickstart.md) — T008
  (allowlist + apply), T009 (contract connect + negative tests), T011 (live posture check),
  T014 (lever preview), T017 (full sign-off; billing-cycle check due early Sept 2026).

**Previous slice — 001-infra-foundation** (four Cognito pools, EMAIL_OTP, state backbone,
Makefile): **applied & verified in dev**; docs in `specs/001-infra-foundation/`. Open items:
the operator OTP sign-in test (T023) and full quickstart sign-off (T035).
<!-- SPECKIT END -->
