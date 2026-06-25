# Implementation Plan: Customer Auth & Onboarding

**Branch**: `001-customer-auth-onboarding` | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-customer-auth-onboarding/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Deliver the customer-facing slice of passwordless auth + onboarding end-to-end on the **mobile
surface (Android + iOS)**, plus the dev infrastructure it stands on. A customer enters an email,
receives a one-time code, enters it, and lands signed in with a profile that is lazily created
on first authenticated call. Sessions persist across restarts via platform secure storage.

Technical approach: a **KMP + Compose Multiplatform** app (Clean Architecture + MVI, Ktor)
talks **directly to a customer-only AWS Cognito user pool** running **passwordless EMAIL_OTP via
custom-auth Lambda triggers**. The **Go hot-path service** (Gin + pgx, raw SQL) exposes
`GET /v1/profile`, validates the customer-pool JWT against Cognito JWKS, and lazy-creates the
`customers`/`profiles` rows (Goose migration). All AWS resources (Cognito pool + triggers, RDS
Postgres, SSM params, remote-state backend) are provisioned with **Terraform** in
**`ap-southeast-1`** (isolated from the existing `ef` platform in `ap-southeast-2`) under
`AWS_PROFILE=ef`, wired together by a **Makefile**. The customer **web** app is a deferred later
slice; the OpenAPI contract and brand tokens are recorded centrally now to keep parity.

## Technical Context

**Language/Version**:
- Hot path: **Go 1.25** (Gin + pgx/v5, raw SQL, no ORM).
- Mobile: **Kotlin 2.1.x + Compose Multiplatform** (Clean Architecture + MVI, Ktor client).
- Auth triggers: **TypeScript on Node 20** (Cognito custom-auth Lambda triggers, arm64).
- Infra: **Terraform** (HCL), multi-env, remote state.

**Primary Dependencies**:
- Go: `gin-gonic/gin`, `jackc/pgx/v5` (+ `pgxpool`), `lestrrat-go/jwx/v2` (JWKS + RS256
  validation), `pressly/goose/v3` (migrations), `aws-sdk-go-v2/ssm` (read params).
- Mobile: Compose Multiplatform, `ktor-client` (+ `content-negotiation`, `kotlinx-serialization`),
  `russhwolf/multiplatform-settings` (`KeychainSettings` on iOS, `EncryptedSharedPreferences`
  on Android) for token storage, Compose Multiplatform Navigation, coroutines/`StateFlow` for
  the MVI store, Koin (lightweight DI).
- Auth Lambdas: AWS Lambda Node runtime, `@aws-sdk/client-sesv2` (send OTP email), `crypto`.
- Infra: Terraform AWS provider; SES (verified sender) for OTP delivery.

**Storage**: PostgreSQL 16 (RDS, dev-sized) for `customers` + `profiles`. Device **secure
storage** (iOS Keychain / Android EncryptedSharedPreferences) for the Cognito token set.

**Testing**: Go — `go test` + `testify`, pgx integration against a disposable Postgres
(Docker/testcontainers); Kotlin — `kotlin.test` for domain/MVI reducers, Compose UI smoke
tests; Terraform — `terraform fmt -check` + `terraform validate`. Tests are pragmatic, not
mandated (constitution Quality Gates verify against acceptance criteria, not TDD).

**Target Platform**: Android (minSdk 26 / target latest), iOS 15+, Go service on
Linux/Fargate (run locally for this slice). Lambdas on Lambda arm64.

**Project Type**: Mobile + API in a monorepo (Gradle owns `apps/customer-mobile`; Go owns
`services/api` via its own `go.mod`; Terraform owns `infra/`).

**Performance Goals**: `GET /v1/profile` p95 < 200 ms (hot-path budget); OTP email delivered to
inbox within 30 s for 95% of requests (SC-002); app cold-to-interactive sign-in screen < 2 s on
mid-tier devices.

**Constraints**: No ORM (raw SQL only). Passwordless — no password ever set or used. No secrets
in code or repo — Cognito ids + DB URL read from **SSM Parameter Store**. All AWS commands run
under **`AWS_PROFILE=ef`** + **`AWS_REGION=ap-southeast-1`** (effy deploys to Singapore to
isolate from `ef` in `ap-southeast-2`; region is a single TF variable, revertable later — the
`ef` profile defaults to `ap-southeast-2`, so region must be set explicitly). Dark mode
required; native-feel (HIG/Material), touch targets
≥ 44pt/48dp, micro-animations on state transitions. Customer pool only — no cross-pool access.

**Scale/Scope**: Dev environment only, single small team. One endpoint, one Cognito pool, four
auth-trigger Lambdas, two tables, ~4 mobile screens (email → code → home stub → signed-out).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.0.0. Evaluated per principle:

| Principle | Gate | Status |
|-----------|------|--------|
| **I. Spec-Driven Development** | spec.md committed + clarified; this plan cites the constitution; tasks.md to follow before code. | ✅ PASS |
| **II. Monorepo w/ Shared Contracts** | One monorepo skeleton created. API contract published as OpenAPI = single source of truth (web client generated from it later). Brand tokens recorded centrally now. Shared *packages* (api-client, design-system) not yet materialized — only one surface exists this slice. | ⚠️ PASS w/ tracked deviation (see Complexity Tracking) |
| **III. Dual-Path Backend Discipline** | `GET /v1/profile` is a latency-sensitive customer read/transaction → **hot path (Go)**: justified. Cognito triggers are event-driven auth infra in **TS/Node** (cold-path language), provisioned with the pool → justified. No ops/admin CRUD this slice → cold-path **API** not built. | ⚠️ PASS w/ tracked deviation (trigger Lambdas via Terraform, not Serverless Framework) |
| **IV. Auth Isolation** | Single **customer** Cognito pool + app client. KMP app authenticates to Cognito directly; Go validates customer-pool JWT via that pool's JWKS; no auth proxy. Driver/store/admin pools untouched. | ✅ PASS |
| **V. Native-Feel, Consistent Design** | Compose Multiplatform with platform-idiomatic navigation/affordances; Jade `#0FB57E` / fill `#047857` from central tokens; dark mode; ≥44pt/48dp targets; micro-animations on transitions. | ✅ PASS |
| **Technology Standards (Locked)** | Go 1.25/Gin/pgx/raw-SQL/no-ORM ✓; KMP+Compose/MVI/Ktor ✓; Node 20 TS Lambdas arm64 ✓; Postgres 16 + Goose forward-only ✓; Terraform multi-env remote state ✓. | ✅ PASS |
| **Quality Gates** | Will ship verified against spec acceptance criteria via quickstart.md; spec+plan+tasks committed with code. | ✅ PASS |

No unjustified violations. Deviations are documented in **Complexity Tracking** below.

## Project Structure

### Documentation (this feature)

```text
specs/001-customer-auth-onboarding/
├── plan.md              # This file (/speckit-plan command output)
├── spec.md              # Feature spec (clarified: passwordless)
├── research.md          # Phase 0 output (decisions + rationale)
├── data-model.md        # Phase 1 output (entities → tables + Cognito/device mapping)
├── quickstart.md        # Phase 1 output (end-to-end validation guide)
├── contracts/           # Phase 1 output
│   ├── profile-api.yaml      # OpenAPI for GET /v1/profile (source of truth)
│   └── auth-flow.md          # Cognito custom-auth sequence + JWT validation contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

Monorepo skeleton this slice introduces (Gradle owns mobile; Go has its own module; Terraform
owns infra; pnpm/turbo reserved for the later web/JS packages):

```text
effy/
├── apps/
│   └── customer-mobile/             # KMP + Compose Multiplatform
│       ├── composeApp/              # shared module (commonMain + androidMain + iosMain)
│       │   └── src/
│       │       ├── commonMain/kotlin/com/effy/customer/
│       │       │   ├── data/        # Ktor Cognito client, token store, profile repo impl
│       │       │   ├── domain/      # entities, use cases (Clean Architecture)
│       │       │   ├── feature/auth/    # MVI: email → code → states
│       │       │   ├── feature/home/    # signed-in home stub + sign out
│       │       │   └── ui/theme/    # Jade tokens, dark mode, components
│       │       ├── androidMain/kotlin/  # EncryptedSharedPreferences token store (actual)
│       │       └── iosMain/kotlin/      # Keychain token store (actual)
│       ├── androidApp/              # Android entry (Activity, manifest)
│       ├── iosApp/                  # iOS entry (SwiftUI host + Xcode project)
│       ├── gradle/                  # version catalog (libs.versions.toml)
│       └── settings.gradle.kts
├── services/
│   └── api/                         # Go hot-path service (own go.mod)
│       ├── cmd/api/main.go          # Gin bootstrap, SSM config load
│       ├── internal/
│       │   ├── auth/                # JWKS fetch + customer-pool JWT middleware
│       │   ├── profile/             # handler + repository (raw SQL via pgx)
│       │   └── config/              # SSM Parameter Store loader
│       ├── migrations/              # Goose forward-only SQL migrations
│       └── go.mod
├── infra/
│   ├── bootstrap/                   # one-time: S3 state bucket + DynamoDB lock table
│   ├── modules/
│   │   ├── cognito-customer-pool/   # pool + app client + 4 trigger Lambdas
│   │   └── rds-postgres/            # dev-sized Postgres + subnet/SG
│   └── envs/
│       └── dev/                     # composes modules: cognito + rds + SSM params
│           └── lambdas/             # TS source for Define/Create/Verify/PreSignUp triggers
├── pnpm-workspace.yaml              # reserved for later JS/TS web packages
├── turbo.json                       # reserved for later JS/TS web packages
├── Makefile                         # wraps tf / migrate / api-run / android / ios
└── go.work                          # (optional) ties services/* Go modules for local dev
```

**Structure Decision**: Mobile + API monorepo. Three build systems coexist by ownership
boundary — **Gradle** under `apps/customer-mobile`, a standalone **Go module** under
`services/api`, and **Terraform** under `infra/`. `pnpm-workspace.yaml` + `turbo.json` are
placed at the root but empty/reserved so the later **customer-web** slice drops in without
restructuring. The auth-trigger Lambdas live under `infra/envs/dev/lambdas/` because their
lifecycle is bound to the Cognito pool (Terraform-managed), not to a deployable API.

## Complexity Tracking

> Deviations from a literal reading of the constitution, with justification. Each is a
> conscious, documented choice — not an oversight (Quality Gates require recorded exceptions).

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Cognito **trigger Lambdas deployed via Terraform**, not the Serverless Framework named in Tech Standards | The Define/Create/Verify/PreSignUp Lambdas are Cognito-coupled event handlers; their lifecycle is the pool's. Terraform provisions the pool, so the triggers belong in the same apply for atomic create/destroy and IAM wiring. | Serverless Framework would split one auth resource across two tools/state stores, risking drift between the pool and its triggers. Serverless Framework stays reserved for the cold-path **API** when it exists. |
| Shared **design-system / api-client packages not yet created** (Principle II) | Only one surface (mobile) exists in this slice. Materializing cross-language shared packages now would be speculative. Brand tokens are recorded centrally (`ui/theme` + documented hex) and the **OpenAPI contract is the source of truth**, so the web slice consumes the same contract/tokens without divergence. | Building empty TS shared packages before the web app exists adds structure with no consumer; divergence risk is controlled by the central token + OpenAPI source of truth instead. |
| **Random discarded secret** at Cognito user creation (custom-auth path) | The Cognito `SignUp` API requires a password field even for custom-auth pools. A client-generated, never-surfaced, never-reused random value satisfies the API while keeping the flow passwordless from the user's perspective. | Native managed `EMAIL_OTP` (USER_AUTH flow) needs no secret at all and is the recommended alternative (see research.md), but the user explicitly chose the custom-auth Lambda-trigger approach for this slice. Revisit at implement time if "literally zero password" is a hard requirement. |
