---

description: "Task list for 035-six-digit-otp"
---

# Tasks: Platform-Wide Six-Digit One-Time Codes

**Input**: Design documents from `/specs/035-six-digit-otp/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[data-model.md](data-model.md) · [contracts/auth-triggers.contract.md](contracts/auth-triggers.contract.md) ·
[quickstart.md](quickstart.md)

**Tests**: **Tests ARE required for this feature.** FR-036 mandates end-to-end coverage of code entry,
the contract pins 14 invariants, and User Story 3 is entirely adversarial verification. This is
authentication — the security logic is testable with zero AWS, and untested security logic is the
defect this platform has shipped before.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Exact file paths are given in every task

## ⚠ Read before starting

1. **Phase 1 contains three BLOCKING spikes.** They can change the design. Nothing in Phase 2 starts
   until they are answered and any consequence is written back into the spec (Principle I).
2. **The security controls live in Phase 2, not in User Story 3.** US3 is P1 and its controls are
   prerequisites for every other story — shipping a 6-digit code without them is a security
   regression, not an increment. US3's own phase is the **adversarial proof** that they hold, which
   is real work and the most important verification in the slice.
3. **Every task touching live AWS is an operator step** and is marked ⚙️. Claude authors the source,
   the Terraform and the tests; the operator applies, deploys and measures.
4. ⚠ **`make apply` is never run without reading the plan first.** See T059.

---

## Phase 1: Setup & Blocking Spikes

**Purpose**: Prove the premise, answer the three questions documentation cannot, scaffold the service.

### ⚠ BLOCKING — these gate everything

- [ ] T001 ⚙️ Measure the current code lengths per quickstart.md §1 — request one real sign-in code and one password-reset code against dev, count the digits, and record both values in `specs/035-six-digit-otp/quickstart.md` §1 (FR-037). ⚠ If sign-in is already 6 digits, STOP and return to `specs/035-six-digit-otp/spec.md`
- [ ] T002 ⚙️ Spike: capture the refusal contract per quickstart.md §2 — exhaust attempts for a real user and for a non-existent address, recording exception name, message, HTTP status and **wall-clock latency** for both in `specs/035-six-digit-otp/research.md` § R12 (FR-016, SC-007)
- [ ] T003 ⚙️ Spike: answer **three** design-deciding questions per quickstart.md §2 — (a) can an `UNCONFIRMED` user start `CUSTOM_AUTH`, or does Cognito refuse before triggers fire; (b) can `ALLOW_USER_AUTH` live on a sign-up-only app client; (c) ⚠ **ADDED DURING IMPLEMENTATION** — with custom-auth triggers attached to the customer pool, does `autoSignIn` after `ConfirmSignUp` still complete from the confirmation alone (one code, today's behaviour) or does it initiate a fresh challenge (two codes, possibly an 8-digit one)? Record in `specs/035-six-digit-otp/research.md` § R4a/R4b
- [ ] T004 Reconcile T001–T003 findings into `specs/035-six-digit-otp/spec.md` and `plan.md` — ⚠ if a spike contradicts the design, amend the earliest affected artifact rather than patching downstream (Principle I)

### Scaffold

- [X] T005 Create `apis/edge-api/auth/package.json` named `@effy/edge-auth` — ⚠ the `@effy/edge-*` prefix is load-bearing or `make edge-test` silently skips the package; deps `@aws-sdk/client-sesv2`, `@aws-sdk/client-dynamodb`, `@aws-sdk/client-cognito-identity-provider`, `@effy/edge-shared`
- [X] T006 [P] Copy `apis/edge-api/customer/tsconfig.json` to `apis/edge-api/auth/tsconfig.json` verbatim
- [X] T007 [P] Copy `apis/edge-api/customer/vitest.config.ts` to `apis/edge-api/auth/vitest.config.ts` verbatim
- [X] T008 [P] Create `apis/edge-api/auth/.gitignore` matching `apis/edge-api/customer/.gitignore`
- [X] T009 Create `apis/edge-api/auth/serverless.yml` (`service: effy-edge-auth`, Node 22, arm64, 256 MB, esbuild ESM, secrets-extension layer, **no `provider.vpc`**) — ⚠ every function has **no `events:` block**; these are Cognito triggers, not HTTP routes
- [X] T010 Create `apis/edge-api/auth/README.md` stating the service serves all four pools and hosts no HTTP route
- [X] T011 Run `make edge-install` and confirm `pnpm -r typecheck` reports 13 packages (12 today + the new service)
- [X] T012 ⚠ **CORRECTED DURING IMPLEMENTATION — do NOT add `auth` to `scripts/edge-health.sh`.** The task as written was a pattern-match on the other three services and was wrong: `edge-auth` has no `events:` block on any function and therefore no HTTP surface, so `/auth/healthz` would report DOWN forever and teach everyone to ignore a red row. A comment recording why it is absent was added to the script instead; the service's liveness is proven by a real sign-in (quickstart §5) and watched by the `Effy/Auth` metrics

**Checkpoint**: Premise measured, spikes answered, service builds and is picked up by the workspace.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The complete trigger implementation, its security controls, the shared UI components, and
the infrastructure — none of which any user story can proceed without.

**⚠️ CRITICAL**: No user story work begins until this phase is complete. In particular, ⚠ **no pool is
attached to a trigger until every control in T017–T024 exists and is tested.**

### The pure policy module — all security logic, zero AWS

- [X] T013 [P] Implement `apis/edge-api/auth/src/otp/codec.ts` — encode/decode `challengeMetadata` as `"v1:<issuedAtEpochSeconds>:<hmacSha256Hex>"` per contracts §1; ⚠ never cleartext (deviates deliberately from the AWS sample, research R1)
- [X] T014 [P] Implement `apis/edge-api/auth/src/otp/policy.ts` — `generateCode()` using `crypto.randomInt` across the full 6-digit space, ⚠ zero-padded **string** so leading zeros survive (FR-001, FR-007)
- [X] T015 [P] Implement `apis/edge-api/auth/src/lib/audience.ts` mapping `event.userPoolId` → audience copy and limits (research R8)
- [X] T016 Add to `apis/edge-api/auth/src/otp/policy.ts`: `verifyAnswer()` — reject unless `^[0-9]{6}$`, recompute HMAC, compare with `crypto.timingSafeEqual` over equal-length buffers, reject when `now > issuedAt + 300` (FR-005, FR-008, FR-015)
- [X] T017 Add to `apis/edge-api/auth/src/otp/policy.ts`: `decideNextStep()` — count `session[]`, ⚠ assert **every** element is `CUSTOM_CHALLENGE` before any `issueTokens: true`, and fail at `session.length >= 3` (FR-011, research R5)
- [X] T018 Add to `apis/edge-api/auth/src/otp/policy.ts`: the `userNotFound` parity branches — identical shape, identical attempt counting, never a short-circuit fail on attempt one (FR-016)
- [X] T019 [P] Write `apis/edge-api/auth/src/otp/codec.test.ts` — round-trip, version rejection, ⚠ assert the encoded string never contains six consecutive plaintext digits (contract invariant 7)
- [X] T020 Write `apis/edge-api/auth/src/otp/policy.test.ts` covering contract invariants 1, 3, 4, 5, 6, 9 — ⚠ including the **off-by-one**: the 3rd attempt is allowed and the 4th is refused (research R5)

### The adapters — also the mock seam (Principle VI)

- [X] T021 [P] Implement `apis/edge-api/auth/src/otp/mailer.ts` — SESv2 `SendEmailCommand`, plain-text body, module-scope client, following `apis/edge-api/customer/src/password/notify.ts`; ⚠ **unlike** that file it must report failure rather than swallow it, because here a failed send means a failed sign-in
- [X] T022 [P] Implement `apis/edge-api/auth/src/otp/issuance.ts` — DynamoDB hourly counter keyed on `"<userPoolId>#<hmac(lowercased email)>"` per data-model.md Entity 3; conditional `UpdateItem`, ⚠ retry-idempotent via the `sends` set (research R6)
- [X] T023 Add fail-open handling to `apis/edge-api/auth/src/otp/issuance.ts` — ⚠ a store outage must **not** block sign-in; emit `otp_ratelimit_store_unavailable` (research R3). ⚠ This is the one deliberate exception to FR-017 and must carry a comment saying so
- [X] T024 Write `apis/edge-api/auth/src/otp/issuance.test.ts` — limit of 5/hour, window boundary, ⚠ the counter is written for **unknown addresses too** (contract invariant 11), and a retried invocation increments once (invariant 12)

### The four triggers

- [X] T025 Implement `apis/edge-api/auth/src/functions/define-auth-challenge.ts` delegating to `policy.decideNextStep()` per contracts §1
- [X] T026 Implement `apis/edge-api/auth/src/functions/create-auth-challenge.ts` — ⚠ generate **only** when `session.length === 0`; otherwise **reuse** the digest from `session[last].challengeMetadata` with no second email and no second counter increment (FR-010, FR-012)
- [X] T027 Add the parity path to `apis/edge-api/auth/src/functions/create-auth-challenge.ts` — on `userNotFound`, ⚠ **still call SES** (mailbox simulator `success@simulator.amazonses.com`) so latency matches naturally rather than via a guessed sleep (FR-016, research R12)
- [X] T028 Implement `apis/edge-api/auth/src/functions/verify-auth-challenge.ts` — pure comparison, no I/O, ⚠ runs the constant-time compare on the `userNotFound` path too (contract invariant 9)
- [X] T029 Implement `apis/edge-api/auth/src/functions/post-authentication.ts` — set `email_verified` idempotently via `AdminUpdateUserAttributes`; ⚠ must not throw, but must emit `otp_email_verify_failed` (FR-020, research R7)
- [X] T030 Audit all four handlers for thrown errors — ⚠ **nothing may throw on a user-data condition**; Cognito returns trigger error text to the client verbatim (contract invariant 10, research R6)
- [X] T031 Widen the `challengeName` type locally in `apis/edge-api/auth/src/otp/types.ts` — ⚠ `@types/aws-lambda@8.10.162`'s union is stale (omits `EMAIL_OTP`, `NEW_PASSWORD_REQUIRED`); treat it as an open `string` (contracts §1)
- [X] T032 Write `apis/edge-api/auth/src/functions/triggers.test.ts` — contract invariants 2, 8, 10 with `mailer` and `issuance` mocked at the module seam per this repo's convention

### Shared UI components (Principle II)

- [X] T033 [P] Create `packages/design-system/src/ui/otp-input.tsx` — a **single** styled field, `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`; ⚠ **no segmented boxes** and **no new npm dependency** (FR-025, research R11)
- [X] T034 Export the new primitive from `packages/design-system/src/ui/index.ts` — ⚠ keep it pure presentation so it can never pull `aws-amplify` into a guest route and trip the dependency-cruiser quarantine
- [X] T035 ⚠ Measure the bundle impact immediately: `make cw-size` — `/search` has **2.1 KB** of headroom against 174 KB. Do **not** raise the limit (research R11)
- [X] T036 [P] Promote `OtpInput` from `apps/shop-mobile/shared/src/commonMain/.../features/auth/presentation/OtpInput.kt` (+ `.android.kt`, `.ios.kt`) into `packages/mobile-kit/ui/`, package `com.effyshopping.mobile.kit.ui`
- [X] T037 Move `OTP_LENGTH` and `normalizeOtp` into `packages/mobile-kit/ui/OtpInput.kt` — ⚠ both are `internal` and both platform actuals call them, so they must land in the same module; ⚠ the new version stops accepting input past six but **must not truncate a longer paste into a valid-looking value** (FR-004, FR-005)
- [X] T038 Verify the promoted mobile control's touch target clears 48 dp — ⚠ 033 shipped a 32 dp control under a comment claiming it cleared the minimum (Principle V)
- [X] T039 Delete the now-duplicated `OtpInput` files from `apps/shop-mobile/.../features/auth/presentation/` and update imports

### Infrastructure

- [X] T040 [P] Create `infra/envs/dev/otp-store.tf` — the DynamoDB table `effy-<env>-otp-issuance` with TTL on `expiresAt`, on-demand capacity, PITR off (data-model.md Entity 3)
- [X] T041 [P] Create `infra/envs/dev/waf-user-pools.tf` — `aws_wafv2_web_acl` with a rate-based rule scoped by `x-amzn-cognito-operation-name` / `x-amzn-cognito-client-id`, plus `aws_wafv2_web_acl_association` per pool (FR-013, research R2)
- [X] T042 Add four trigger ARN variables and the `lambda_config` entries to `infra/modules/cognito-user-pool/{main.tf,variables.tf}`, mirroring the existing `pre_sign_up` pattern
- [X] T043 Add `auth_session_validity = 5` to the app clients in `infra/modules/cognito-user-pool/main.tf` — ⚠ never below 5, or the session expires before the third attempt (research R5)
- [X] T044 Add the `aws_lambda_permission` resources — ⚠ **one per (function, pool) = 16 total**, `source_arn` pinned to a single pool ARN; a wildcard would silently admit any future pool (contracts §2)
- [X] T045 Add IAM to `apis/edge-api/auth/serverless.yml` — `ses:SendEmail`, DynamoDB read/write on the one table, `cognito-idp:AdminUpdateUserAttributes` scoped to **all four** pool ARNs, and `secretsmanager:GetSecretValue` for the HMAC key
- [X] T046 Add the `OTP_HMAC_KEY` secret and the `OTP_TABLE_NAME` / `OTP_SENDER` env wiring; ⚠ `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS` and `OTP_SENDS_PER_HOUR` stay **code constants** — a rate limit that an environment variable can widen is one an incident will widen (data-model.md)

### The guard that guards this change

- [X] T047 Extend `scripts/verify-pool-credentials.sh` to assert the intended `ALLOW_CUSTOM_AUTH` state per pool and to check the **two mobile clients** — ⚠ it currently greps only three flow names and reads only `app_client_id`, so it would report ✓ PASS while four pools gain a new first-factor flow (research R14)
- [X] T048 Prove the extended guard by deliberately breaking it — set a wrong flow in a scratch plan and confirm it exits non-zero and **names the pool**

**Checkpoint**: The complete implementation exists and is unit-proven. ⚠ Nothing is attached to any
pool yet — no user is affected.

---

## Phase 3: User Story 1 — A shop operator can sign in at all (Priority: P1) 🎯 MVP

**Goal**: Restore passwordless sign-in on shop-mobile, which cannot succeed today, and prove the whole
vertical slice on the internal audiences.

**Independent Test**: Provision a shop operator, request a sign-in code on shop-mobile, enter it
exactly as received, and reach the order queue. Verifiable with no other surface changed.

⚠ **Back-office is migrated first inside this phase**, before shop — it is the smallest, safest
population and the cheapest place to discover that rollback does not work (plan.md § Rollout).

### Client changes — internal audiences

- [X] T049 [US1] Change the auth flow to `CUSTOM_WITHOUT_SRP` in `packages/web-kit/src/auth/otp.ts:15` — ⚠ never `CUSTOM_WITH_SRP` (amplify-android #2566 issues tokens without presenting the challenge)
- [X] T050 [US1] Add the `CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE` branch to the `switch` in `packages/web-kit/src/auth/otp.ts:17-24` — ⚠ this is breakage site #1; its `default` **throws**, taking down shop-web and back-office together
- [X] T051 [P] [US1] Add the new step to `AuthStep` in `apps/shop-mobile/shared/src/commonMain/.../core/auth/AuthModels.kt` — ⚠ modelling it in the **sealed interface** turns the silent runtime `else ->` failure into a compile error (plan.md Risk 4)
- [X] T052 [US1] Update `apps/shop-mobile/shared/src/androidMain/.../AmplifyAuthDriver.kt:69-73` to `AuthFlowType.CUSTOM_AUTH_WITHOUT_SRP` and handle the new step in `mapSignIn` (~`:87-90`)
- [X] T053 [US1] Update `apps/shop-mobile/iosApp/iosApp/SwiftAuthBridge.swift:36-46` to `.customWithoutSRP` and add `.confirmSignInWithCustomChallenge` to the `mapSignIn` switch (~`:65-73`)
- [X] T054 [US1] Add the new outcome constant to `apps/shop-mobile/shared/src/iosMain/.../IosAuthDriver.kt` `BridgeAuthResult` (~`:71-76`) and its `when` (~`:47`) — ⚠ stringly-typed across two files with no compiler help (breakage site #4)
- [X] T055 [US1] Point `apps/shop-mobile/.../features/auth/presentation/SignInScreen.kt` at the promoted `packages/mobile-kit/ui/OtpInput.kt` and remove the local import
- [X] T056 [P] [US1] Write `apps/shop-mobile/shared/src/commonTest/.../AuthStepMappingTest.kt` asserting the first `signIn` returns the challenge step and ⚠ **never** `DONE` (contract invariant 13)
- [X] T057 [P] [US1] Write a cross-language step-name fixture — a byte-identical JSON literal in `apis/edge-api/auth/src/otp/step-names.test.ts` and `apps/shop-mobile/shared/src/commonTest/.../StepNameContractTest.kt` (contract invariant 14; 028's precedent)

### Terraform — internal pools

- [X] T058 [US1] Set `explicit_auth_flows = ["ALLOW_CUSTOM_AUTH","ALLOW_REFRESH_TOKEN_AUTH"]` on the back-office, shop and driver clients plus `shop_mobile` in `infra/envs/dev/auth-{backoffice,shop,driver}.tf` — ⚠ `ALLOW_USER_AUTH` is dropped entirely; these audiences have no self-signup, so they land clean (research R4b)
- [ ] T059 ⚙️ [US1] Run `make plan ENV=dev` and grep the output for `must be replaced` / `forces replacement` on any `aws_cognito_user_pool` or `aws_cognito_user_pool_client` — ⚠⚠ **if any line matches, STOP. Do not apply.** A replaced pool destroys the 006 first admin, every 009 shop operator and every customer (FR-030, SC-012)

### Deploy and prove — back-office, then shop

- [ ] T060 ⚙️ [US1] `make edge-deploy SERVICE=auth ENV=dev`, then record the four ARNs into `infra/envs/dev/dev.tfvars` — ⚠ Lambdas must exist **before** `lambda_config` references them; Cognito validates on `UpdateUserPool`
- [ ] T061 ⚙️ [US1] `make mail-verify ENV=dev` — ⚠ under this design a failed send is a failed sign-in, and three audiences have no password fallback
- [ ] T062 ⚙️ [US1] `make apply ENV=dev` attaching the back-office pool only, then walk quickstart.md §5 checks 1–10 on the back-office console
- [ ] T063 ⚙️ [US1] Rehearse the rollback drill (quickstart.md §7) on back-office and reverse it — ⚠ do this now, while back-office is the only migrated audience (FR-033, SC-013)
- [ ] T064 ⚙️ [US1] Attach the shop pool and walk quickstart.md §5 checks 1–10 on **shop-web**
- [ ] T065 ⚙️ [US1] Walk quickstart.md §5 checks 1–10 on **shop-mobile**, on a real tablet — ⚠ this is SC-001, the journey that cannot be completed at all today
- [ ] T066 ⚙️ [US1] Verify SC-001 end to end: the shop operator reaches the order queue after signing in
- [ ] T067 ⚙️ [US1] Run quickstart.md §5 check 9 (CloudWatch Logs Insights, `filter @message like /[0-9]{6}/`) — ⚠ expect **zero hits** (FR-014, SC-008)
- [ ] T068 ⚙️ [US1] Run `make shop-verify-isolation ENV=dev` (expect `200 200 401 401`) and the extended `make verify-pool-credentials ENV=dev` (FR-018, FR-031)

**Checkpoint**: ⚠ Shop-mobile sign-in works for the first time. The internal audiences are on 6-digit
codes, rollback is rehearsed, and no customer has been touched.

---

## Phase 4: User Story 2 — Every sign-in code on every surface is six digits (Priority: P1)

**Goal**: Extend the proven slice to the remaining pool and the two customer surfaces, so the platform
has exactly one code length.

**Independent Test**: On each remaining surface, request a sign-in code, count the digits, confirm it
is accepted.

⚠ A partial rollout leaves the platform with **three** code lengths instead of two — worse than the
starting point. This phase is not optional once Phase 3 ships.

### customer-web

- [X] T069 [US2] Change the auth flow to `CUSTOM_WITHOUT_SRP` in `apps/customer-web/app/(auth)/_lib/auth-actions.ts:103`
- [X] T070 [US2] Add explicit `signInStep` handling to `apps/customer-web/app/(auth)/_lib/auth-actions.ts` — ⚠ breakage site #5: there is **no `switch` at all** today, so a new step fails later and more confusingly
- [X] T071 [US2] ⚠ **CORRECTED DURING IMPLEMENTATION — `autoSignIn` is RETAINED, not replaced.** The task assumed removing it was required because Amplify supports only `USER_AUTH` there. But the code a customer types on the sign-up route is the `ConfirmSignUp` code, which is **already six digits and untouched by FR-003**; `autoSignIn` merely completes the session and issues no code of its own, so FR-001 is not engaged. Replacing it with an explicit `signIn` would have left them confirmed but signed out, needing a **second** code — a regression. ⚠ What `autoSignIn` does once triggers are attached is undocumented; **added to spike T003**
- [X] T072 [P] [US2] Adopt `@effy/design-system/ui`'s `otp-input` in `apps/customer-web/app/(auth)/sign-in/SignInForm.tsx:119-127` and `sign-up/SignUpForm.tsx:145-153`
- [X] T073 [P] [US2] Adopt the shared field in `packages/web-kit/src/console/OtpSignInCard.tsx:138-154`, preserving the `One-time code` label the four existing tests match on

### customer-mobile

- [X] T074 [P] [US2] Add the new step to `AuthStep` in `apps/customer-mobile/shared/src/commonMain/.../core/auth/AuthModels.kt:23-34` (compile-time safety, as T051)
- [X] T075 [US2] Update `apps/customer-mobile/shared/src/androidMain/.../AmplifyAuthDriver.kt:119-123` to `CUSTOM_AUTH_WITHOUT_SRP` and handle the new step in `mapSignIn` (`:187-192`)
- [X] T076 [US2] Update `apps/customer-mobile/iosApp/iosApp/SwiftAuthBridge.swift:137-139` to `.customWithoutSRP` and extend `mapSignIn` (`:179-187`)
- [X] T077 [US2] Add the new outcome constant to `apps/customer-mobile/shared/src/iosMain/.../IosAuthDriver.kt` (`:92-97`, `:63-68`)
- [X] T078 [US2] Replace `EffyField` with the promoted `OtpInput` in `apps/customer-mobile/shared/src/commonMain/.../features/auth/presentation/AuthScreens.kt:411-427` — ⚠ this gives customer-mobile one-time-code **autofill** for the first time (FR-026)
- [X] T079 [US2] Wire `packages/mobile-kit` into `apps/customer-mobile/shared/build.gradle.kts` if the `srcDir` entry does not already cover `ui/` (it does at `:51` — verify, do not duplicate)

### Terraform — customer + driver

- [X] T080 [US2] Set `explicit_auth_flows` on the customer clients in `infra/envs/dev/auth-customer.tf` (`:44`, `:162`) to add `ALLOW_CUSTOM_AUTH` while retaining `ALLOW_USER_SRP_AUTH` and `ALLOW_USER_AUTH` — ⚠ per T003's answer; record the bypass status in `research.md` § R4b either way
- [ ] T081 ⚙️ [US2] Re-run T059's plan-and-grep, then `make apply ENV=dev` attaching the driver and customer pools

### Prove

- [ ] T082 ⚙️ [US2] Walk quickstart.md §5 checks 1–10 on **customer-web**
- [ ] T083 ⚙️ [US2] Walk quickstart.md §5 checks 1–10 on **customer-mobile (iOS)**
- [ ] T084 ⚙️ [US2] Walk quickstart.md §5 checks 1–10 on **customer-mobile (Android)** — ⚠ Android has gone unlooked-at across three consecutive slices (028, 029, 033); that does not repeat here (SC-014)
- [ ] T085 ⚙️ [US2] Verify quickstart.md §5 checks 13–14: password reset, set-first-password and account closure are ⚠ **still 6 digits and still working**, and email+password sign-in is unaffected (FR-003, FR-032)
- [ ] T086 ⚙️ [US2] Confirm SC-002 across all five code-issuing flows and all six surfaces — **zero eight-digit codes observed**

**Checkpoint**: ⚠ Exactly one code length exists on the platform.

---

## Phase 5: User Story 3 — A guessed code is refused, and a farmed code is refused too (Priority: P1)

**Goal**: Prove adversarially that the compensating controls built in Phase 2 actually hold.

**Independent Test**: Attack the flow directly — wrong codes past the limit, code requests past the
limit, expired codes, replayed codes, and probes for addresses with no account. No UI required.

⚠ The controls were built in Phase 2 because nothing could ship without them. **This phase is where
they are proven**, and it is the most important verification in the slice: six digits is a hundredfold
smaller guess space, and Cognito enforces **none** of these limits for us.

- [X] T087 [P] [US3] Write `apis/edge-api/auth/src/otp/bruteforce.test.ts` — exhaustive attempt-limit cases including the boundary (3rd allowed, 4th refused) and ⚠ that a wrong answer triggers **no** second email and **no** second counter increment (contract invariants 2, 3)
- [X] T088 [P] [US3] Write `apis/edge-api/auth/src/otp/replay.test.ts` — a used code, a superseded code and an expired code are each refused (FR-008, FR-009, FR-010, SC-006)
- [X] T089 [P] [US3] Write `apis/edge-api/auth/src/otp/parity.test.ts` — response shape, attempt counting and the constant-time compare are identical for `userNotFound`, and no trigger throws on a user-data condition (contract invariants 6, 9, 10, 11)
- [X] T090 [US3] Add a leakage assertion to `apis/edge-api/auth/src/otp/policy.test.ts` — ⚠ neither `challengeMetadata` nor `publicChallengeParameters` may contain the code; `publicChallengeParameters` carries **only** `maskedDestination` (contract invariants 7, 8)
- [ ] T091 ⚙️ [US3] Verify the WAF rate-based rule fires — exceed the per-source rate against a dev pool and confirm `ForbiddenException` (FR-013, research R2)
- [ ] T092 ⚙️ [US3] Verify the per-address limit — request 6 codes for one address in an hour; the 6th is refused with a retry-after and ⚠ **no email is sent** (FR-012, SC-005)
- [ ] T093 ⚙️ [US3] Adversarial existence-parity walk (SC-007) — a tester is given the sign-in form and a mixed list of real and fake addresses and ⚠ **must not be able to tell which is which** from content, wording **or latency**
- [ ] T094 ⚙️ [US3] Confirm no email reaches a non-existent address, and that the issuance counter **was** written for it (FR-016, contract invariant 11)
- [ ] T095 ⚙️ [US3] Run the full-sweep secret audit (SC-008) — search every log, trace and metric produced during a complete sign-in for a readable code or HMAC; ⚠ expect zero
- [X] T096 [US3] Add the six CloudWatch metrics from research R15 to the trigger handlers, ⚠ dimensioned by `userPoolId` **only** — never by email or `sub` (Principle VII)
- [X] T097 [US3] Add the four alarms — verify-failure-rate spike, trigger error rate, `otp_ratelimit_store_unavailable > 0`, ⚠ the last because the fail-open path in T023 is silent by design and must not be
- [ ] T098 ⚙️ [US3] Verify a barred customer with a correct code is still refused (FR-023, quickstart §5 check 15)

**Checkpoint**: The security trade the spec accepted is now evidenced, not asserted.

---

## Phase 6: User Story 4 — A new customer's account is properly verified (Priority: P2)

**Goal**: Reinstate the account confirmation and email verification that managed `EMAIL_OTP` performed
automatically and `CUSTOM_AUTH` does not.

**Independent Test**: Create a new account through the code route, complete sign-in, and inspect the
resulting account's confirmation and email-verification state.

⚠ **This is the most likely silent, delayed failure in the whole slice.** Nothing breaks visibly if it
is missed — until Google linking refuses, possibly weeks later.

- [X] T099 [US4] Extend `apis/edge-api/customer/src/functions/pre-sign-up.ts` with `autoConfirmUser: true` per T003's answer — ⚠ `autoVerifyEmail` stays **false**; auto-verifying would mark an address verified that nobody has proved control of, which Principle IV names an account-takeover primitive (research R4a)
- [X] T100 [US4] Add a collision check to `apis/edge-api/customer/src/lib/account-linking.ts` mitigating address squatting introduced by auto-confirmation (research R4a)
- [X] T101 [P] [US4] Write `apis/edge-api/customer/src/lib/account-linking.test.ts` cases for the auto-confirm branch and the collision refusal
- [X] T102 [P] [US4] Write `apis/edge-api/auth/src/functions/post-authentication.test.ts` — sets `email_verified` once, is idempotent on a second sign-in, and ⚠ never throws (FR-020)
- [ ] T103 ⚙️ [US4] Wire `pre_sign_up` on the customer pool in `infra/envs/dev/auth-customer.tf` (the ARN has existed since 011 but has never been attached — `customer_pre_sign_up_lambda_arn` defaults to `null`), re-run T059's plan-and-grep, and apply
- [ ] T104 ⚙️ [US4] Create a brand-new account via the code route and confirm with `admin-get-user` that it is `CONFIRMED` with `email_verified: true` (quickstart §5 check 11)
- [ ] T105 ⚙️ [US4] Link Google sign-in on the same verified address and confirm it resolves to the **same** account and one `sub` (FR-022, SC-009)

**Checkpoint**: One person is still one identity across all three credential routes.

---

## Phase 7: User Story 5 — The platform's own words are true (Priority: P2)

**Goal**: Every code field on every surface says six, expects six, and is reachable by assistive
technology and autofill.

**Independent Test**: Walk every code-entry screen on every surface and confirm the stated and enforced
length agree with what was sent.

- [X] T106 [P] [US5] Replace the stale D23 comments at `apps/customer-web/app/(auth)/sign-in/SignInForm.tsx:110-118` and `sign-up/SignUpForm.tsx:136-144` — ⚠ they instruct future authors **not** to constrain code length, which was correct under the mismatch and is wrong now (FR-029)
- [X] T107 [P] [US5] Fix `apps/customer-mobile/shared/src/commonMain/.../features/auth/presentation/AuthScreens.kt:419` — the placeholder already said "6-digit code" on the 8-digit sign-in path and is finally true; confirm rather than assume
- [X] T108 [P] [US5] Add `inputMode="numeric"` and `autoComplete="one-time-code"` to `apps/customer-web/app/(auth)/reset-password/ResetPasswordForm.tsx:76` — ⚠ it has neither today, an inconsistency this sweep should close
- [X] T109 [P] [US5] Audit and align every code-related string listed in research §D1–D4 of the codebase sweep across all six surfaces (FR-024, FR-027)
- [X] T110 [US5] Ensure the five refusal cases produce **distinguishable** messages on every surface — wrong, expired, superseded, too many attempts, too many requests (FR-027) — ⚠ and that none discloses whether an address has an account (FR-028)
- [X] T111 [P] [US5] Write a Playwright spec `apps/customer-web/e2e/otp-entry.spec.ts` covering field length, paste with separators, refusal of an 8-digit value and the refusal messages — ⚠ with the code **injected, not received**; there is no way to read a real email in this repo (FR-036, research R16)
- [X] T112 [P] [US5] Extend `packages/web-kit/src/console/OtpSignInCard.test.tsx` and both console `SignInScreen.test.tsx` files for the new step and the shared field
- [ ] T113 ⚙️ [US5] Screen-reader walk on every surface — ⚠ the field must announce as **one** one-time-code field, not several (FR-025, SC-011)
- [ ] T114 ⚙️ [US5] Device autofill walk — iOS and Android both populate the field in one action (FR-026, SC-011)
- [ ] T115 ⚙️ [US5] SC-010 walk — five people unfamiliar with the platform each complete a sign-in on first attempt without asking how many digits to enter

**Checkpoint**: All five user stories independently functional.

---

## Phase 8: Polish, Governance & Sign-Off

**Purpose**: Settle the record, update the documents that would otherwise become false, and close out.

- [X] T116 Amend `.specify/memory/constitution.md` **1.11.0 → 1.11.1 (PATCH)** — clarify that "passwordless EMAIL_OTP" names the **credential**, not the vendor's enum, with a Sync Impact Report entry (FR-040, research R13)
- [X] T117 [P] Update the dependent documents in the same change: `CLAUDE.md` § Auth, `ARCHITECTURE.md`, `packages/web-kit/{package.json:7,src/index.ts:4,src/auth/otp.ts:4-8,src/runtime/amplify.ts:6}`, `infra/modules/cognito-user-pool/{main.tf:1-4,variables.tf:32-50}`
- [X] T118 [P] Supersede **D23** in `specs/011-customer-storefront-web/research.md` — record what it established correctly, what evidence changed, and why it is reversed (FR-038)
- [X] T119 [P] Record the dismissal of D23's cheaper alternative (unifying on the sign-in flow, which yields **eight** not six) in `specs/035-six-digit-otp/research.md` (FR-039)
- [X] T120 [P] Update `docs/audiences/customer-capabilities.md`, `docs/audiences/shop-capabilities.md` and `docs/audiences/admin-capabilities.md` with the new credential behaviour (FR-042)
- [X] T121 [P] Record the two accepted capability losses — passkeys as a future first factor on the affected pools, and auto-sign-in after sign-up — in `specs/035-six-digit-otp/research.md` (FR-041)
- [X] T122 ⚠ Correct the stale claim in `CLAUDE.md:33` that remote state uses a DynamoDB lock — it uses the S3-native lockfile, and this feature introduces the platform's genuine first DynamoDB table
- [X] T123 Run the full machine sweep from quickstart.md §3 — `make edge-test`, `pnpm -r typecheck` (13/13), `pnpm -r test`, `turbo build`, `make fmt`, `make validate ENV=dev`, `make cw-gates`, `make cm-guard`, `make sm-guard`, `make cm-tokens-check` (⚠ expect **unchanged** — this slice adds no token), both Gradle suites, and the iOS compile
- [X] T124 ⚠ Verify the iOS **test** compilation, not just the main one — `:shared:iosSimulatorArm64Test` on both apps; 033 discovered its iOS test suite had never compiled because backtick test names contained a comma
- [ ] T125 ⚙️ Re-run `make verify-pool-credentials ENV=dev` and confirm the extended guard passes against the final live state
- [ ] T126 ⚙️ Complete the quickstart.md §8 sign-off checklist
- [X] T127 Record the carry-forwards honestly in `specs/035-six-digit-otp/SIGNOFF.md` — client telemetry still deferred (now thirteen slices), automated end-to-end OTP entry still impossible without a test inbox, and the customer-pool bypass status per T003
- [ ] T128 Commit — ⚠ spec, plan, tasks and the constitution amendment land **with** the code (Principle I, Quality Gates)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup + Spikes)**: no dependencies. ⚠ T001–T004 **block everything**
- **Phase 2 (Foundational)**: depends on Phase 1. ⚠ **Blocks all user stories** — no pool is attached until it completes
- **Phase 3 (US1)**: depends on Phase 2
- **Phase 4 (US2)**: depends on Phase 3 — the pattern is proven on internal audiences before it reaches customers
- **Phase 5 (US3)**: unit tests (T087–T090) can run right after Phase 2; the operator walks depend on Phase 3
- **Phase 6 (US4)**: depends on Phase 4 (customer pool must be live)
- **Phase 7 (US5)**: component work depends on Phase 2; per-surface copy depends on that surface being migrated
- **Phase 8**: depends on all stories being complete

### User Story Dependencies

- **US1 (P1)**: the MVP. Independently deliverable — internal audiences only, no customer touched
- **US2 (P1)**: depends on US1 in **practice** (deliberately, per the rollout), not in principle
- **US3 (P1)**: its *controls* are Phase 2 prerequisites; its *proof* is independently runnable
- **US4 (P2)**: needs the customer pool live (US2)
- **US5 (P2)**: largely independent; per-surface tasks track their surface

### Parallel Opportunities

- T006–T008 (scaffold copies) run together
- T013–T015 (three independent modules) run together
- T019, T024, T032 (test files) run together once their subjects exist
- T033 (web component) and T036 (mobile promotion) run together
- T040, T041 (two Terraform files) run together
- T087–T089 (three test files) run together
- T116–T122 (documentation) all run together

---

## Parallel Example: Phase 2 Foundational

```bash
# The three independent modules:
Task: "Implement codec.ts in apis/edge-api/auth/src/otp/codec.ts"
Task: "Implement generateCode in apis/edge-api/auth/src/otp/policy.ts"
Task: "Implement audience.ts in apis/edge-api/auth/src/lib/audience.ts"

# The two shared UI components:
Task: "Create packages/design-system/src/ui/otp-input.tsx"
Task: "Promote OtpInput into packages/mobile-kit/ui/"

# The two Terraform files:
Task: "Create infra/envs/dev/otp-store.tf"
Task: "Create infra/envs/dev/waf-user-pools.tf"
```

---

## Implementation Strategy

### MVP (User Story 1)

1. Phase 1 — ⚠ **measure the premise and answer the spikes before writing any code**
2. Phase 2 — the full implementation and its controls, unit-proven, attached to nothing
3. Phase 3 — back-office first (rehearsal + rollback drill), then shop-web, then shop-mobile
4. **STOP and VALIDATE**: a shop operator signs in and reaches the order queue — a journey that cannot
   be completed at all today
5. The customer audience is untouched at this point, and rollback is one client constant

### Incremental Delivery

1. Setup + Foundational → implementation exists, nobody affected
2. US1 → internal audiences on 6 digits, **MVP shipped**
3. US2 → customer surfaces migrate; exactly one code length on the platform
4. US3 → the security trade is evidenced adversarially
5. US4 → account verification reinstated; Google linking still works
6. US5 → the copy tells the truth everywhere
7. Phase 8 → the record is settled and the change is committed

### Notes

- [P] = different files, no dependencies
- ⚙️ = operator step touching live AWS; Claude authors, the operator runs
- ⚠ Commit after each logical group. Every checkpoint is a safe stopping point
- ⚠ **Do not mark this feature complete on machine-verified checks alone.** Every requirement that
  matters here — a code that arrives, a refusal that reads right, a latency that does not leak — is
  only provable with a real inbox
