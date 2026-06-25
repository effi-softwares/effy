---
description: "Task list for Customer Auth & Onboarding implementation"
---

# Tasks: Customer Auth & Onboarding

**Input**: Design documents from `/specs/001-customer-auth-onboarding/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: NOT requested in the spec → no dedicated test-writing tasks. Each user story ends
with a **validation checkpoint** that verifies its acceptance scenarios via `quickstart.md`
(constitution Quality Gate: ship verified against acceptance criteria).

**Organization**: Tasks are grouped by user story. Setup + Foundational are shared; an
auth slice is heavy on shared foundation, so US1 is the first demoable increment (MVP) and
US2–US4 are smaller increments built on the same flow.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 (user-story phases only; Setup/Foundational/Polish have no story label)
- All paths are repo-relative, per the Project Structure in `plan.md`.

## Path Conventions

- Mobile (KMP): `apps/customer-mobile/composeApp/src/{commonMain,androidMain,iosMain}/kotlin/com/effy/customer/`
- Go hot path: `services/api/`
- Infra: `infra/{bootstrap,modules,envs/dev}/`
- All AWS-touching commands run under `AWS_PROFILE=ef` **and** `AWS_REGION=ap-southeast-1`
  (effy deploys to Singapore to isolate from `ef` in `ap-southeast-2`; region is a single TF
  variable, revertable later). The `ef` profile defaults to `ap-southeast-2`, so set region
  explicitly.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo skeleton + tooling so every track has a home.

- [ ] T001 Create the monorepo directory skeleton (`apps/`, `services/api/`, `infra/{bootstrap,modules,envs/dev/lambdas}/`) per `plan.md` Project Structure
- [ ] T002 [P] Add root `.gitignore` covering Go, Kotlin/Gradle, Terraform (`.terraform/`, `*.tfstate*`), Node, and `.env`/secrets
- [ ] T003 [P] Create root `Makefile` exporting `AWS_PROFILE=ef` + `AWS_REGION=ap-southeast-1` and target stubs: `tf-bootstrap`, `tf-dev-plan`, `tf-dev-apply`, `tf-dev-destroy`, `migrate`, `api-run`, `android`, `ios`
- [ ] T004 [P] Add reserved `pnpm-workspace.yaml` + `turbo.json` at repo root (empty/placeholder for the later JS/TS web packages)
- [ ] T005 Initialize the Go module `services/api/go.mod` (Go 1.25) with `gin-gonic/gin`, `jackc/pgx/v5`, `lestrrat-go/jwx/v2`, `pressly/goose/v3`, `aws-sdk-go-v2/ssm`
- [ ] T006 [P] Scaffold the KMP project `apps/customer-mobile` (`settings.gradle.kts`, `composeApp/`, `androidApp/`, `iosApp/`, `gradle/libs.versions.toml`) with Compose Multiplatform, Ktor client, kotlinx-serialization, `multiplatform-settings`, Koin
- [ ] T007 [P] Initialize the Node 20 + TS package for Cognito triggers in `infra/envs/dev/lambdas/` (`package.json`, `tsconfig.json`, `@aws-sdk/client-sesv2`)
- [ ] T008 [P] Add `go.work` at repo root tying `services/api` for local dev

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cognito + DB + service skeleton + app shell that ALL user stories require.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Infrastructure (Terraform, `AWS_PROFILE=ef`)

- [ ] T009 [P] `infra/bootstrap/`: S3 remote-state bucket (versioned + encrypted) + DynamoDB lock table in **`ap-southeast-1`**; runs on local state first (one-time)
- [ ] T010 Author `infra/modules/cognito-customer-pool/`: user pool (email sign-in, case-insensitive), **public** app client (`ALLOW_CUSTOM_AUTH` + `ALLOW_REFRESH_TOKEN_AUTH`, no secret), token lifetimes (~30-day refresh per research.md D7)
- [ ] T011 Implement `PreSignUp` trigger (auto-confirm user + auto-verify email) in `infra/envs/dev/lambdas/preSignUp.ts`
- [ ] T012 [P] Implement `DefineAuthChallenge` trigger (issue `CUSTOM_CHALLENGE`; `issueTokens` on correct; fail after 3 wrong) in `infra/envs/dev/lambdas/defineAuthChallenge.ts`
- [ ] T013 [P] Implement `CreateAuthChallenge` trigger (gen 6-digit OTP, 10-min expiry, `privateChallengeParameters`, send via SES) in `infra/envs/dev/lambdas/createAuthChallenge.ts`
- [ ] T014 [P] Implement `VerifyAuthChallengeResponse` trigger (compare submitted code to private OTP + expiry check) in `infra/envs/dev/lambdas/verifyAuthChallenge.ts`
- [ ] T015 Wire the 4 Lambda triggers (arm64) + IAM roles (incl. `ses:SendEmail`) into `infra/modules/cognito-customer-pool/`
- [ ] T016 [P] Author `infra/modules/rds-postgres/`: dev-sized Postgres 16, subnet group, security group, `citext` + `pgcrypto` enabled
- [ ] T017 [P] Provision an SES verified sender identity in `infra/envs/dev/` (note: sandbox → must verify test recipients — see research.md D4)
- [ ] T018 Compose `infra/envs/dev/` (S3 backend; `region` var **= `ap-southeast-1`**) wiring `cognito-customer-pool` + `rds-postgres` + SES
- [ ] T019 Write SSM params in `infra/envs/dev/`: `/effy/dev/cognito/customer_pool_id`, `/effy/dev/cognito/customer_app_client_id`, `/effy/dev/db/url` (SecureString)
- [ ] T020 Author Goose migration `services/api/migrations/00001_customers_profiles.sql` creating `customers` + `profiles` per `data-model.md` (citext email, 1:1 FK, unique `cognito_sub`)

### Go hot-path service skeleton

- [ ] T021 [P] SSM config loader in `services/api/internal/config/config.go` (reads the 3 params via `aws-sdk-go-v2/ssm`; no hardcoded secrets)
- [ ] T022 [P] pgx pool init + Gin bootstrap + `GET /healthz` in `services/api/cmd/api/main.go` and `services/api/internal/db/`
- [ ] T023 Customer-pool JWT middleware in `services/api/internal/auth/` (jwx/v2 cached JWKS; assert `iss`, `token_use=access`, `client_id`; extract `sub`+`email`; 401 otherwise) per `contracts/auth-flow.md` §4

### KMP app shell

- [ ] T024 [P] Theme in `composeApp/.../ui/theme/` — Jade tokens (`#0FB57E` / fill `#047857`), dark mode, typography, base components
- [ ] T025 [P] Navigation scaffold (signed-out ↔ signed-in graphs) + app entry in `composeApp/.../` (Compose Multiplatform Navigation)
- [ ] T026 [P] `TokenStore`: `commonMain` interface + `iosMain` Keychain + `androidMain` EncryptedSharedPreferences (via `multiplatform-settings`) in `composeApp/.../data/`
- [ ] T027 Cognito Ktor client in `composeApp/.../data/` — `InitiateAuth(CUSTOM_AUTH)`, `RespondToAuthChallenge`, `SignUp`, `InitiateAuth(REFRESH_TOKEN_AUTH)` per `contracts/auth-flow.md` (no SigV4, public client)
- [ ] T028 [P] Profile API Ktor client for `GET /v1/profile` (Bearer access token) in `composeApp/.../data/`, typed from `contracts/profile-api.yaml`
- [ ] T029 [P] Koin DI modules wiring client, token store, repositories in `composeApp/.../`

**Checkpoint**: Cognito pool live, DB migrated, service validates tokens, app shell runs → user stories can begin.

---

## Phase 3: User Story 1 - Create an account and land signed in (Priority: P1) 🎯 MVP

**Goal**: New email → emailed code → signed in, with a profile auto-created on first call.

**Independent Test**: With a brand-new (SES-verified) email, complete the code flow and reach
the signed-in home; confirm `customers` + `profiles` rows now exist (quickstart #1–#3).

### Implementation

- [ ] T030 [US1] Auth domain use cases in `composeApp/.../domain/` — `RequestCode` (start `CUSTOM_AUTH`; on `UserNotFound` call `SignUp` with a discarded random secret then restart) and `VerifyCode` (respond with code; persist tokens) per research.md D2
- [ ] T031 [US1] Profile repository (raw SQL, pgx) in `services/api/internal/profile/repository.go` — single-tx lazy upsert: `INSERT customers ON CONFLICT (cognito_sub) DO NOTHING` + ensure 1:1 `profiles` (data-model.md state transition)
- [ ] T032 [US1] Profile handler + route `GET /v1/profile` in `services/api/internal/profile/handler.go`, mounted under the JWT middleware in `main.go`; returns `Profile` per `contracts/profile-api.yaml`
- [ ] T033 [P] [US1] MVI store `EmailEntry` (validate email format, submit, loading/error states) in `composeApp/.../feature/auth/`
- [ ] T034 [P] [US1] MVI store `CodeEntry` (submit code; wrong-code / expired / resend-cooldown / too-many-attempts states) in `composeApp/.../feature/auth/`
- [ ] T035 [US1] Email-entry screen (Compose) wired to `EmailEntry` store — native-feel, ≥48dp/44pt targets, invalid-email message
- [ ] T036 [US1] Code-entry screen (Compose) wired to `CodeEntry` store — all error states, resend button w/ cooldown, micro-animation on transition
- [ ] T037 [US1] On verify success: persist tokens to `TokenStore`, navigate to home (signed-in graph)
- [ ] T038 [US1] Home stub screen — calls the profile API client, renders signed-in state with the returned profile
- [ ] T039 [US1] **Validate US1**: run quickstart scenarios #1 (sign-up→signed-in + rows created), #2 (wrong code), #3 (expired + resend) on Android and iOS

**Checkpoint**: US1 fully functional and demoable — the MVP.

---

## Phase 4: User Story 2 - Returning customer signs in (Priority: P2)

**Goal**: An existing account signs in again and gets the same profile (no duplicate).

**Independent Test**: Sign out, sign in again with the same email + a fresh code; reach
signed-in state and confirm the same single profile is returned (quickstart #4).

### Implementation

- [ ] T040 [US2] Handle the existing-user path in `RequestCode` / Cognito client: `SignUp` → `UsernameExistsException` treated as "already registered → proceed to OTP" (FR-013) in `composeApp/.../domain/` + `data/`
- [ ] T041 [US2] Confirm returning sign-in returns the same profile (repository idempotency — no second row) in `services/api/internal/profile/`
- [ ] T042 [US2] Entry-screen messaging/routing so the same email screen serves new and returning customers seamlessly in `composeApp/.../feature/auth/`
- [ ] T043 [US2] **Validate US2**: run quickstart scenario #4 (returning sign-in, same profile) on Android and iOS

**Checkpoint**: New and returning customers both reach signed-in; one account per email.

---

## Phase 5: User Story 3 - Stay signed in across restarts (Priority: P2)

**Goal**: Force-quit/reopen stays signed in; expired session degrades gracefully.

**Independent Test**: Sign in, force-quit and reopen → still signed in; then revoke/expire the
refresh token and reopen → returned to signed-out gracefully (quickstart #5–#6).

### Implementation

- [ ] T044 [US3] Session-restore use case in `composeApp/.../domain/` — read refresh token from `TokenStore`, call `REFRESH_TOKEN_AUTH`, refresh the access token
- [ ] T045 [US3] App-launch session gate: route to signed-in vs signed-out based on restore result in `composeApp/.../` (app entry / navigation)
- [ ] T046 [US3] Graceful expiry: on refresh failure clear `TokenStore` → signed-out (US3 #3)
- [ ] T047 [US3] Handle session-expired-while-open — a `401` from the profile API drops to signed-out at the next protected action (edge case in spec)
- [ ] T048 [US3] **Validate US3**: run quickstart scenarios #5 (restart still signed in) and #6 (expired → graceful sign-out) on Android and iOS

**Checkpoint**: Sessions persist and expire cleanly across the full lifecycle.

---

## Phase 6: User Story 4 - Sign out (Priority: P3)

**Goal**: Customer signs out and must re-authenticate to continue.

**Independent Test**: From signed-in, sign out → signed-out state; protected screens require
sign-in again (quickstart #7).

### Implementation

- [ ] T049 [US4] `SignOut` use case in `composeApp/.../domain/` — clear `TokenStore` (+ optional Cognito `GlobalSignOut` with the access token)
- [ ] T050 [US4] Sign-out action on the home screen → route back to the signed-out graph in `composeApp/.../feature/home/`
- [ ] T051 [US4] Gate protected screens after sign-out (no token → require re-auth) (FR-009)
- [ ] T052 [US4] **Validate US4**: run quickstart scenario #7 (sign out → signed-out, re-auth required) on Android and iOS

**Checkpoint**: Full auth loop closed.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Quality, parity, and the spec's success criteria across all stories.

- [ ] T053 [P] Error-copy pass for every FR-012 case (wrong code, expired, already-registered, invalid email, too-many-attempts) — consistent, actionable strings
- [ ] T054 [P] Accessibility + touch-target (≥44pt/48dp) + micro-animation audit across all screens (Principle V)
- [ ] T055 [P] Dark-mode verification across all screens on both platforms (Principle V)
- [ ] T056 [P] Cross-pool rejection check: `GET /v1/profile` with a non-customer-pool token → `401` (quickstart #8, Principle IV)
- [ ] T057 [P] Parity validation Android vs iOS for all scenarios (FR-016, quickstart #9)
- [ ] T058 [P] Makefile completeness + README run docs linking `quickstart.md`; confirm every AWS target sets `AWS_PROFILE=ef`
- [ ] T059 [P] Document SES sandbox + verify a test recipient address (research.md D4)
- [ ] T060 Full `quickstart.md` end-to-end run-through; confirm all acceptance criteria and Success Criteria SC-001…SC-007

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories**.
- **User Stories (Phases 3–6)**: all depend on Foundational. US1 is the MVP; US2/US3/US4
  reuse US1's email→code flow and home screen, so they are best sequenced **after US1** (they
  are independently *testable* but share US1's UI surface).
- **Polish (Phase 7)**: depends on the user stories being delivered.

### Key dependencies within Foundational

- T009 (bootstrap) → T018 (dev env uses the S3 backend).
- T011–T014 (trigger Lambdas) → T015 (wire into pool) → T018 (compose) → T019 (SSM).
- T016 (RDS) → T018; T020 migration SQL can be authored anytime but `make migrate` runs after T018.
- T023 (JWT middleware) consumes pool id/client id at runtime from SSM (T019/T021).

### Critical path (longest chain)

T001 → T005/T006 → [T009 → T015 → T018 → T019] + [T020] → T023/T027 → T030–T032 → T037–T039 (US1 done).

---

## Parallel Opportunities

- **Setup**: T002, T003, T004, T006, T007, T008 are all `[P]` (distinct files).
- **Foundational tracks run in parallel**: Infra (T009–T020), Go service (T021–T023), and KMP
  shell (T024–T029) are three independent tracks. Within them, the `[P]` tasks (e.g., the three
  challenge Lambdas T012–T014; theme/nav/token-store T024–T026; config/db T021–T022) parallelize.
- **US1**: T033 and T034 (two MVI stores, different files) run in parallel; the Go endpoint
  (T031–T032) is a separate track from the mobile screens (T033–T038).
- **Polish**: T053–T059 are all `[P]`.

### Parallel example — Foundational Lambdas

```bash
# Author the three challenge Lambdas together (different files, no interdependency):
Task: "T012 DefineAuthChallenge in infra/envs/dev/lambdas/defineAuthChallenge.ts"
Task: "T013 CreateAuthChallenge in infra/envs/dev/lambdas/createAuthChallenge.ts"
Task: "T014 VerifyAuthChallengeResponse in infra/envs/dev/lambdas/verifyAuthChallenge.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (the heavy lift for an auth slice).
2. Phase 3 US1 → **STOP and VALIDATE** (quickstart #1–#3) on both platforms.
3. This is a genuine, demoable MVP: a new customer can sign up and land signed in with a profile.

### Incremental Delivery

1. Foundation ready → US1 (MVP) → demo.
2. US2 (returning sign-in) → demo.
3. US3 (persistent session) → demo.
4. US4 (sign out) → demo. Each adds value without breaking the prior.

### Notes

- `[P]` = different files, no dependency on an incomplete task.
- `[Story]` label maps each task to its user story for traceability.
- No dedicated test tasks (none requested); validation checkpoints (T039, T043, T048, T052, T060)
  enforce the constitution Quality Gate of verifying against acceptance criteria.
- The customer **web** app is a deferred slice; it will consume `contracts/profile-api.yaml` and
  the same brand tokens to keep parity (FR-016).
- Commit after each task or logical group; every AWS-touching step runs under `AWS_PROFILE=ef` + `AWS_REGION=ap-southeast-1`.
