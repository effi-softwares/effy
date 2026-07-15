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
- **Unidirectional client state** — mobile MVVM (a ViewModel exposing immutable, observable state; the View calls its functions for user actions);
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
  flows from `var.aws_region` / the `/effy/<env>/region` SSM contract. **Four values pin a region
  outside Terraform** and must be changed by hand on any future move — the Lambda
  Parameters-and-Secrets **layer ARN** (its AWS-owned account id differs per region), the embedded
  **RDS CA bundle** (`apis/edge-api/shared/src/lib/rds-ca.ts`, region-rooted chain), each
  `serverless.yml` `provider.region`, and (010) any **ACM certificate behind CloudFront/Amplify**,
  which **must** live in **`us-east-1`** regardless of the platform's region — the regional API
  Gateway certificate correctly follows `var.aws_region`, but a CloudFront-fronted one cannot.
  **Route 53 hosted zones are global and have no region** — they survive a region move untouched.
  Runbook: [infra/envs/README.md](infra/envs/README.md).
- **Domain: `effyshopping.com`** (registered at **GoDaddy**; DNS authority delegated to Route 53).
  The apex is **production's, and reserved** — nothing is deployed there. Every environment gets a
  **delegated child namespace** it fully owns (`dev.effyshopping.com`), created by its own env root
  along with its own `NS` delegation record in the parent — so destroying an env removes both
  together and leaves no dangling delegation. The parent zone lives in a **new `infra/global/`
  root** (`make global-apply`), deliberately outside the `ENV=` workflow so `make destroy ENV=dev`
  can never take the platform's apex with it. Registrar control is an **out-of-code dependency**:
  Terraform can rebuild every zone and record, but not the domain.
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
AWS Cognito, **four isolated pools**: customer / driver / shop / admin. **Credentials are
per-audience** (constitution v1.7.0, amended by 011):
- **Driver / shop / admin** — **strictly passwordless EMAIL_OTP**, admin-provisioned (no self-signup).
  **There are no passwords on the platform's internal audiences.**
- **Customer** — the only audience Effy does not employ, and the only one open to the public: **open
  self-registration** with **three credential routes — email+password, email OTP, and Google
  federated sign-in**. All three MUST converge on **one profile / one `sub`** (a federated identity is
  **linked into the native profile**), and **linking requires a provider-asserted *verified* email** —
  linking on an unverified email is an account-takeover primitive, not a convenience.

**Pools MAY define RBAC groups** surfaced via the `cognito:groups` JWT claim: the
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
**migration workflow**, the **cold path** (`apis/edge-api/{shared,admin,shop,customer}`), and **all
three web surfaces** — `apps/back-office` (005), `apps/shop-web` (007) and **`apps/customer-web`
(011 — the first PUBLIC surface, Next.js 16 SSR)** — on the shared packages
`@effy/{design-system,shared-types,api-client,web-kit}`.

**Two of the three KMP mobile apps are now built** (KMP + Compose, Clean Architecture + MVVM, native
Amplify auth behind a `commonMain` `AuthDriver`; a formal `ViewModel → UseCase → Driver/Repository`
domain layer): **`apps/customer-mobile` (013)** and **`apps/shop-mobile` (014 — signed off, EMAIL_OTP
only, single-token, the RBAC manager gate, tablet-first)**. **`apps/driver-mobile` remains the base
template.** Still the **documented vision**: the **catalog** (there are no product tables anywhere yet),
**cart / checkout / payment**, the hot path's **cloud deployment** (`core-api` is local-Docker-only by
decision — its go-live is its own slice), and the **event backbone**.

Everything gets built **slice by slice**, each driven by its own spec → plan → tasks. Don't build all
surfaces in parallel: one vertical slice proves the foundation before the pattern scales.

## Active feature

**014-shop-mobile-foundation** — Shop Mobile Foundation (Bootstrap). ✅ **SIGNED OFF (partial by design);
committed.**
The platform's **fifth client surface**: `apps/shop-mobile` (KMP + Compose, Clean Architecture + MVVM),
the shop-operator app. "013 for the shop audience" — the tech spine is ported from `apps/customer-mobile`
with the shop deltas: **strictly passwordless EMAIL_OTP** (no password/sign-up/recovery — the audience's
rules made structural in the `AuthDriver` interface), a **single access-token bearer** to `/shop/v1/*`
(not customer's two-token protocol, D2s), and **RBAC done right** — role-aware UI is a courtesy, the
**backend manager gate** (`GET /shop/v1/manager-ping`) decides (role AND status AND active-shop scope),
uniform + fail-closed.
- **New Cognito client**: a dedicated **`shop_mobile`** app client on the existing shop pool
  (`infra/envs/dev/auth-shop.tf`) — EMAIL_OTP only (no SRP), 30-day refresh (shared workplace device,
  D6s), added to the shop edge authorizer's audience. Additive; the pool is untouched.
- **Tablet-first (FR-003a)**: the primary device is a **large-screen tablet in landscape**; layout is
  **window-size-driven** (`AdaptiveContent` over Material 3 breakpoints — never an `isTablet` boolean),
  the pattern every later shop-mobile UI slice extends.
- **Shared-infra generalizations (Principle II)**: the Compose-theme generator now emits a **per-app
  package** (`packages/design-system/compose-shop`); the mobile secret-guard covers **both** apps. During
  the slice a clean-architecture pass added a **formal use-case layer to both mobile apps** and removed the
  service-locator container seam (ViewModels take explicit collaborators) — 013 was refactored in lockstep
  for parity.
- **Partial by design (like 007)**: the manager gate's **positive** half (a manager at an active shop →
  Granted) + inactive-shop/disabled denials need **009** shop data. **Deferred** (with owning slices):
  telemetry → `mobile-telemetry`; iOS HIG chrome → `iOS native shell`.
- Status: **signed off + committed** — both apps build/run on Android **and** iOS; shop 9 unit tests +
  customer 10 green; guards + drift + `terraform validate` clean.
  Spec/artifacts: [specs/014-shop-mobile-foundation/](specs/014-shop-mobile-foundation/); parity register:
  [docs/audiences/shop-capabilities.md](docs/audiences/shop-capabilities.md).

**013-customer-mobile-foundation** — Customer Mobile Foundation. **Built (the pattern 014 ports).** The
first KMP mobile surface: `apps/customer-mobile` — Amplify-native auth behind a `commonMain` `AuthDriver`
(Android Amplify + a Swift `IosAuthBridge`), the two-token protocol, three credential routes. Constitution
amended to **v1.8.0** (mobile presentation is **MVVM**, not MVI).

**012-customer-profile-management** — Customer Profile Management. **Code-complete + verified;
operator run pending (2 blocking spikes).**
Completes the customer account page: identity (name · email · **initials avatar**), name editing,
**change-or-set password**, and **sign out** — which the storefront did not have at all, despite the
parity register claiming it did (now corrected).
- **The slice exists for one requirement.** Cognito's `ChangePassword` docs: *"The user's previous
  password is required **if the user has a password**. If the user has no password… **you can omit this
  parameter**."* So **any bearer of a valid access token can silently plant a permanent password on a
  passwordless account** — turning a borrowed phone or a stolen token into durable, credentialed access
  that an OTP-only customer would never notice. **FR-017** closes it: setting a *first* password requires
  a **freshly emailed code**, verified **server-side in the same request that writes the password**, so
  there is no stored "grant" to steal. Changing an *existing* password requires the current one.
- **Two spec defects found during planning, fixed in the spec (not papered over)**: **FR-024** was
  *unbuildable* (Cognito's revocation is all-or-nothing — "revoke all but this device" does not exist), so
  it was made **stronger**: a password change signs out **everywhere, including this device**. **FR-022**
  was *bypassable* via "Forgot password?", which also left `has_password` permanently wrong — so recovery
  moved behind the backend (**FR-022b**).
- **`has_password` is a platform-owned column** — **Cognito cannot be asked** whether a user has a
  password (no API field; `UserStatus` doesn't distinguish). It is seeded at registration from a
  client-declared route, which is safe because **lying in either direction grants no capability the
  inbox-holder didn't already have**. It is a UX hint, never an authorization input.
- **The Cognito calls need NO IAM.** `ChangePassword` / `GlobalSignOut` / the attribute-verification pair
  are **token-authorized** — the Lambda relays the *customer's own* authority. The only new permission in
  the slice is `ses:SendEmail`.
- **Sign-out is a route handler + plain HTML form**, not a Server Action: `aws-amplify/auth/server` has
  **no `signOut`**, and importing the client one broke the quarantine guard (which was right). The header
  became a **server component** (`<details>` + `<form>`) — sign-out now costs **zero client JS**, works
  with JS disabled, and the guest bundle **fell 159.6 → 149.9 KB**. The correct architecture was cheaper.
- **Password policy → 12 chars, no composition rules** (a documented deviation from NIST's 15, valid *only*
  while breach screening + rate limiting hold) + **k-anonymity breach screening**, **fail-closed**,
  backend-only so it cannot be skipped by a hostile client.
- Status: **code-complete** — `pnpm typecheck` (11/11) + `pnpm -r test` (**286 tests**) + `turbo build` +
  **70 Playwright E2E** all green; both gates green (**149.9/160 KB** budget; quarantine clean **and proven
  by deliberately breaking it**); `terraform validate` + `fmt` clean; secret/PII sweep clean.
  **⚠ Open (operator)**: **T001/T002 — the two BLOCKING spikes** (does `ChangePassword`-without-previous
  actually work on our pool? and what does "Forgot password?" do *today* for a passwordless customer — that
  path is **live right now** and its behavior is unknown); **T059** (`make apply` — password policy;
  *abort if the pool would be replaced*), **T060** (migration + `db-up`), **T061** (`edge-deploy`), **T062**
  (**SES must send — without it, set-password does not work at all**; 010 dependency), **T069** (live SC
  sign-off incl. the adversarial SC-004/SC-005 proofs).
  Spec/plan/artifacts: [specs/012-customer-profile-management/](specs/012-customer-profile-management/).

**011-customer-storefront-web** — Customer Storefront (Bootstrap). **Code-complete + verified;
operator run pending.**
The platform's **fourth client surface and its FIRST PUBLIC one**: `apps/customer-web`
(`@effy/customer-web`, **Next.js 16.2.6** App Router on :3000). Every surface before it sits behind a
login and serves an Effy employee; this one is open to anyone, must be found by search engines, and
serves a person who has no account until they choose to make one.
- **Constitution amended → v1.7.0**: Principle IV's credential rule is now **per-audience**. The
  **customer** pool gains **email+password · email OTP · Google**, with **open self-registration**;
  **driver/shop/admin remain strictly passwordless EMAIL_OTP and admin-provisioned** ("no passwords"
  narrows to the platform's *internal* audiences, rather than being silently dropped). Linking a
  federated identity **requires a provider-asserted verified email** — linking on an unverified one is
  an account-takeover primitive, and that is written into the constitution as a prohibition.
- **SSR-first, guest-first**: `cacheComponents: true` (Next 16's Cache Components) makes PPR the
  rendering model, so public pages prerender into a **static shell** and the personalized header is a
  **server-rendered Suspense island** — personalization costs neither the cache nor the crawler. "Is
  this page still cacheable?" is now a **build error**, not a Lighthouse score three months late.
- **The Amplify quarantine (FR-006)**: `aws-amplify` lives **only** in `app/(auth)/`. Amplify's own
  docs put `Amplify.configure()` in the root layout — for a storefront that is exactly wrong (it lands
  in the shared chunk every page loads). Guests read session state **server-side** and download **zero
  bytes** of auth SDK — verified, not asserted.
- **Backend**: a new `apis/edge-api/customer` (customer authorizer) — `GET`/`PATCH /customer/v1/me`,
  record-backed identity + idempotent JIT upsert + the **barred-customer refusal** (a valid credential
  never overrides the record). Plus the **pre-sign-up account-linking Lambda**: without it, Google
  sign-in silently creates a *second* account and **there is no retroactive merge**.
- **Data**: one migration (`20260714120000_customer.sql`) — `public.customer`, keyed on `cognito_sub`
  (which **survives federated linking**, so one person keeps one record across all three routes).
- **The routing law (FR-028), binding on every later customer slice**: commerce (product · catalog ·
  search · cart · order · payment) → **hot path** (`core-api`); customer profile/account → **cold
  path**. Proven live against `core-api`'s `GET /v1/customer/ping`.
- **⚠ Two corrections made during implementation, both recorded in research**: (1) the **120 KB bundle
  budget was unreachable** — Next 16 + React 19's framework floor is ~136 KB with *zero* app code; the
  enforced budget is **160 KB** against a measured **148.5 KB**, and it still catches Amplify (proven
  by deliberately leaking it: 162.7 KB → build fails). (2) The **quarantine guard was initially wrong**
  — dependency-cruiser matches *direct* imports by default, so it reported clean while Amplify was on
  the home page via a component. Fixed with `reachable: true`; the lesson (*break a guard the way it
  will actually break*) is in research D11.
- Status: **code-complete** — workspace `pnpm typecheck` + `pnpm -r test` (**248 tests**) + `turbo
  build` green; **27 Playwright E2E** green (raw-HTML SSR, SEO, no-cloaking, auth-outage, deferred
  sign-in, open-redirect refusals); both gates green; `terraform validate` + `fmt` clean on all six
  roots; shellcheck clean.
  **Open (operator)**: **T050** (register the Google OAuth client — out-of-code), **T051** (`make apply
  ENV=dev`; *abort if any pool would be replaced*), **⚠ T052/T053** (the two **spikes** —
  `AliasExistsException` on first Google sign-in, and whether a never-had-a-password customer can set
  one; **both can change the design**), **T081** (commit the migration + `make db-up ENV=dev`),
  **T082** (`make edge-deploy SERVICE=customer ENV=dev`), **T090** (live SC sign-off).
  Spec/plan/artifacts: [specs/011-customer-storefront-web/](specs/011-customer-storefront-web/).
  Parity register: [docs/audiences/customer-capabilities.md](docs/audiences/customer-capabilities.md).

**010-domain-dns-foundation** — Platform Domain & Per-Environment Namespaces. **Code-complete;
operator run pending.**
Makes the platform authoritative for **`effyshopping.com`**, gives each environment a **delegated
child namespace**, moves the shared API onto **`edge-api.dev.effyshopping.com`**, and switches all four
Cognito pools to **branded sign-in email** (`no-reply@dev.effyshopping.com`). **Terraform only — zero
application code**, and the first slice since 002 with no SQL.
- **New root `infra/global/`** owns the parent zone. It is deliberately **not an environment**: env
  roots are destroyable (`make destroy ENV=dev` was used in the region relocation), and the apex must
  not be collateral. Each env root creates its own child zone **and its own `NS` delegation in the
  parent** — so destroy removes both together and no dangling delegation can be claimed.
- **Two new modules**: `dns-env-zone` (child zone + delegation + wildcard ACM cert, DNS-validated)
  and `ses-domain-identity` (SESv2 identity + DKIM/SPF/DMARC). Adding qa/staging is `env = "qa"`.
- **Additive cutover**: the raw `execute-api` URL stays alive (`disable_execute_api_endpoint` must
  remain `false`) and is published at `/effy/<env>/edge/api_default_endpoint`. The existing
  `api_endpoint` key keeps its name and gains a better **value** → every reader picks up the branded
  address with zero code edits.
- **Why the email half matters**: EMAIL_OTP is the **only** credential the platform issues, on all
  four pools. The built-in Cognito sender caps at ~50/day from a generic AWS address. Two alarms ship
  with it — an SES reputation breach *pauses sending*, which means **nobody can sign in at all**.
- **⚠ Ordering is load-bearing**: `make global-apply` → **repoint GoDaddy** → `dig` to confirm →
  `make apply ENV=dev` → `make mail-verify` → flip `ses_sender_enabled = true` → apply again. ACM
  validation and SES DKIM both need *public resolution*, so an early apply blocks 45 min and fails.
  Cognito additionally **rejects an unverified SES identity**, which is why the pool switch is its
  own stage.
- Status: **code-complete** — `terraform validate` green on all roots, `fmt` clean, shellcheck clean.
  **Open (operator)**: T016–T018 (global apply, GoDaddy repoint, dev apply), T022/T025 (custom domain
  + re-read the two `.env` files), T026/T029/T032 (SES production access, pool switch, live mail),
  T033/T034 (plan-only proofs), T040/T041 (sign-off + commit).
  Spec/plan/artifacts: [specs/010-domain-dns-foundation/](specs/010-domain-dns-foundation/).

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
at specs/014-shop-mobile-foundation/plan.md
<!-- SPECKIT END -->
