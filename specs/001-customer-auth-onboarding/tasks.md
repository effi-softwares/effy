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

**Scope (this slice)**: Customer **mobile only** (Android + iOS) per the refined spec. The
customer **web** app and mobile↔web parity are a **separate future slice** — there are
intentionally no web tasks here. FR-016/SC-007 parity is therefore Android↔iOS (validated by
T057). Region: all AWS in **`ap-southeast-1`** (see Path Conventions).

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

- [X] T001 Create the monorepo directory skeleton (`apps/`, `services/api/`, `infra/{bootstrap,modules,envs/dev}/`) per `plan.md` Project Structure
- [X] T002 [P] Add root `.gitignore` covering Go, Kotlin/Gradle, Terraform (`.terraform/`, `*.tfstate*`), Node, and `.env`/secrets
- [X] T003 [P] Create root `Makefile` exporting `AWS_PROFILE=ef` + `AWS_REGION=ap-southeast-1` and target stubs: `tf-bootstrap`, `tf-dev-plan`, `tf-dev-apply`, `tf-dev-destroy`, `migrate`, `api-run`, `android`, `ios`
- [X] T004 [P] Add reserved `pnpm-workspace.yaml` + `turbo.json` at repo root (empty/placeholder for the later JS/TS web packages)
- [X] T005 Initialize the Go module `services/api/go.mod` (Go 1.25) with `gin-gonic/gin`, `jackc/pgx/v5`, `lestrrat-go/jwx/v2`, `pressly/goose/v3`, `aws-sdk-go-v2/ssm`
- [X] T006 [P] Scaffold the KMP project `apps/customer-mobile` (`settings.gradle.kts`, `composeApp/` with android+ios targets, `iosApp/`, `gradle/libs.versions.toml`) on the adopted stack — Compose Multiplatform 1.10, AWS Amplify (auth), Navigation 3 + CMP ViewModel, Ktor, kotlinx-serialization, `multiplatform-settings`, BuildKonfig (no Koin); Android entry in `composeApp/src/androidMain` (idiomatic CMP, no separate `androidApp` module)
- ~~T007 — Node/TS package for Cognito trigger Lambdas~~ **REMOVED**: managed EMAIL_OTP needs no triggers; the scaffold was deleted (research D1).
- [X] T008 [P] Add `go.work` at repo root tying `services/api` for local dev

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cognito + DB + service skeleton + app shell that ALL user stories require.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Infrastructure (Terraform, `AWS_PROFILE=ef`)

- [ ] T009 [P] `infra/bootstrap/`: S3 remote-state bucket (versioned + encrypted) + DynamoDB lock table in **`ap-southeast-1`**; runs on local state first (one-time)
- [ ] T010 Author `infra/modules/cognito-customer-pool/`: user pool on the **Essentials tier** with **managed passwordless EMAIL_OTP**, email sign-in (case-insensitive), **public** app client (`USER_AUTH` flow + `ALLOW_REFRESH_TOKEN_AUTH`, no secret), token lifetimes (~30-day refresh), SES as the pool email sender
- ~~T011–T015 — Cognito custom-auth Lambda triggers (PreSignUp / Define / Create / Verify + wiring)~~ **REMOVED**: replaced by Cognito **managed EMAIL_OTP** (research D1). No trigger Lambdas — Cognito generates, sends, and validates the OTP. (IDs retired; later numbering unchanged.)
- [ ] T016 [P] Author `infra/modules/rds-postgres/`: dev-sized Postgres 16, subnet group, security group, `citext` + `pgcrypto` enabled
- [ ] T017 [P] Configure **SES as the Cognito pool's email sender** (verified sender identity) in `infra/envs/dev/` for managed EMAIL_OTP delivery (note: SES sandbox → verify test recipients — research.md D4)
- [ ] T018 Compose `infra/envs/dev/` (S3 backend; `region` var **= `ap-southeast-1`**) wiring `cognito-customer-pool` + `rds-postgres` + SES
- [ ] T019 Write SSM params in `infra/envs/dev/`: `/effy/dev/cognito/customer_pool_id`, `/effy/dev/cognito/customer_app_client_id`, `/effy/dev/db/url` (SecureString)
- [ ] T020 Author Goose migration `services/api/migrations/00001_customers_profiles.sql` creating `customers` + `profiles` per `data-model.md` (citext email, 1:1 FK, unique `cognito_sub`)

### Go hot-path service skeleton

- [ ] T021 [P] SSM config loader in `services/api/internal/config/config.go` (reads the 3 params via `aws-sdk-go-v2/ssm`; no hardcoded secrets)
- [ ] T022 [P] pgx pool init + Gin bootstrap + `GET /healthz` in `services/api/cmd/api/main.go` and `services/api/internal/db/`
- [ ] T023 Customer-pool JWT middleware in `services/api/internal/auth/` (jwx/v2 cached JWKS; assert `iss`, `token_use=access`, `client_id`; extract `sub`+`email`; 401 otherwise) per `contracts/auth-flow.md` §4

### KMP app shell

- [ ] T024 [P] Theme in `composeApp/.../ui/theme/` — Jade tokens (`#0FB57E` / fill `#047857`), dark mode, typography, base components
- [ ] T025 [P] Navigation scaffold (signed-out ↔ signed-in graphs) + app entry in `composeApp/.../` using **Navigation 3** (`navigation3-ui` + `lifecycle-viewmodel-navigation3`)
- [ ] T026 [P] Amplify setup: initialize Amplify Auth on each platform from BuildKonfig (`COGNITO_USER_POOL_ID` / `COGNITO_APP_CLIENT_ID` / `AWS_REGION`); Amplify owns token storage + refresh (research D7/D8). `multiplatform-settings` only for non-auth prefs
- [ ] T027 `AuthRepository` in `composeApp/.../data/` — `expect` interface in commonMain; `actual` Android = Amplify Android, `actual` iOS = Amplify Swift bridge; passwordless `signIn(EMAIL_OTP)` / `confirmSignIn(code)` / `signUp` / session / `signOut` per `contracts/auth-flow.md`
- [ ] T028 [P] Profile API Ktor client for `GET /v1/profile` (Bearer token from the Amplify session via ktor-client-auth) in `composeApp/.../data/`, typed from `contracts/profile-api.yaml`
- [ ] T029 [P] Wire dependencies via manual / ViewModel factories (no Koin) and set up **BuildKonfig** config fields (region / pool id / app client id / API base URL) in `composeApp/.../`

**Checkpoint**: Cognito pool live, DB migrated, service validates tokens, app shell runs → user stories can begin.

---

## Phase 3: User Story 1 - Create an account and land signed in (Priority: P1) 🎯 MVP

**Goal**: New email → emailed code → signed in, with a profile auto-created on first call.

**Independent Test**: With a brand-new (SES-verified) email, complete the code flow and reach
the signed-in home; confirm `customers` + `profiles` rows now exist (quickstart #1–#3).

### Implementation

- [ ] T030 [US1] Auth domain use cases in `composeApp/.../domain/` — `RequestCode` (Amplify passwordless `signIn` EMAIL_OTP; sign up if the email is new) and `VerifyCode` (`confirmSignIn(code)`; Amplify persists the session) per research.md D2/D5
- [ ] T031 [US1] Profile repository (raw SQL, pgx) in `services/api/internal/profile/repository.go` — single-tx lazy upsert: `INSERT customers ON CONFLICT (cognito_sub) DO NOTHING` + ensure 1:1 `profiles` (data-model.md state transition)
- [ ] T032 [US1] Profile handler + route `GET /v1/profile` in `services/api/internal/profile/handler.go`, mounted under the JWT middleware in `main.go`; returns `Profile` per `contracts/profile-api.yaml`
- [ ] T033 [P] [US1] MVI `EmailEntryViewModel` (CMP ViewModel: validate email, submit, loading/error states) in `composeApp/.../feature/auth/`
- [ ] T034 [P] [US1] MVI `CodeEntryViewModel` (submit code; wrong-code / expired / resend-cooldown / too-many-attempts states) in `composeApp/.../feature/auth/`
- [ ] T035 [US1] Email-entry screen (Compose) wired to `EmailEntryViewModel` — native-feel, ≥48dp/44pt targets, invalid-email message
- [ ] T036 [US1] Code-entry screen (Compose) wired to `CodeEntryViewModel` — all error states, resend button w/ cooldown, micro-animation on transition
- [ ] T037 [US1] On verify success: Amplify persists the session; navigate to home (signed-in graph)
- [ ] T038 [US1] Home stub screen — calls the profile API client, renders signed-in state with the returned profile
- [ ] T039 [US1] **Validate US1**: run quickstart scenarios #1 (sign-up→signed-in + rows created), #2 (wrong code), #3 (expired + resend) on Android and iOS

**Checkpoint**: US1 fully functional and demoable — the MVP.

---

## Phase 4: User Story 2 - Returning customer signs in (Priority: P2)

**Goal**: An existing account signs in again and gets the same profile (no duplicate).

**Independent Test**: Sign out, sign in again with the same email + a fresh code; reach
signed-in state and confirm the same single profile is returned (quickstart #4).

### Implementation

- [ ] T040 [US2] Handle the existing-user path in `RequestCode` / `AuthRepository`: a known email signs in (Amplify `signIn` EMAIL_OTP); a duplicate sign-up resolves to sign-in (FR-013) in `composeApp/.../domain/` + `data/`
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

- [ ] T044 [US3] Session-restore use case in `composeApp/.../domain/` — `Amplify.fetchAuthSession()` (Amplify silently refreshes); map to signed-in / signed-out
- [ ] T045 [US3] App-launch session gate: route to signed-in vs signed-out based on the Amplify session in `composeApp/.../` (app entry / navigation)
- [ ] T046 [US3] Graceful expiry: when the Amplify session is invalid/expired → signed-out (US3 #3)
- [ ] T047 [US3] Handle session-expired-while-open — a `401` from the profile API drops to signed-out at the next protected action (edge case in spec)
- [ ] T048 [US3] **Validate US3**: run quickstart scenarios #5 (restart still signed in) and #6 (expired → graceful sign-out) on Android and iOS

**Checkpoint**: Sessions persist and expire cleanly across the full lifecycle.

---

## Phase 6: User Story 4 - Sign out (Priority: P3)

**Goal**: Customer signs out and must re-authenticate to continue.

**Independent Test**: From signed-in, sign out → signed-out state; protected screens require
sign-in again (quickstart #7).

### Implementation

- [ ] T049 [US4] `SignOut` use case in `composeApp/.../domain/` — `Amplify.Auth.signOut()` (optionally global sign-out to revoke server-side)
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
- T010 (cognito module, managed EMAIL_OTP) + T017 (SES pool email) + T016 (RDS) → T018 (compose) → T019 (SSM).
- T016 (RDS) → T018; T020 migration SQL can be authored anytime but `make migrate` runs after T018.
- T023 (JWT middleware) consumes pool id/client id at runtime from SSM (T019/T021).

### Critical path (longest chain)

T001 → T005/T006 → [T009 → T010 → T018 → T019] + [T020] → T023/T027 → T030–T032 → T037–T039 (US1 done).

---

## Parallel Opportunities

- **Setup**: T002, T003, T004, T006, T007, T008 are all `[P]` (distinct files).
- **Foundational tracks run in parallel**: Infra (T009–T020), Go service (T021–T023), and KMP
  shell (T024–T029) are three independent tracks. Within them, the `[P]` tasks (e.g., the three
  RDS/SES/cognito T010/T016/T017; theme/nav/Amplify T024–T026; config/db T021–T022) parallelize.
- **US1**: T033 and T034 (two MVI stores, different files) run in parallel; the Go endpoint
  (T031–T032) is a separate track from the mobile screens (T033–T038).
- **Polish**: T053–T059 are all `[P]`.

### Parallel example — Foundational tracks

```bash
# Three independent foundational tracks run in parallel (infra / Go / KMP shell):
Task: "T010 cognito-customer-pool (managed EMAIL_OTP) + T016 rds-postgres + T017 SES pool email"
Task: "T021 SSM config loader + T022 pgx pool & Gin bootstrap (services/api)"
Task: "T024 theme + T025 Navigation 3 scaffold + T026 Amplify setup (composeApp)"
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
