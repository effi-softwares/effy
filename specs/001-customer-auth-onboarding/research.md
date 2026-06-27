# Phase 0 Research: Customer Auth & Onboarding

All decisions below resolve the Technical Context for the plan. Sign-in was clarified to
**passwordless** (spec). Two later decisions (2026-06-25, post-`/speckit-analyze`) reshaped the
auth approach: the mobile app uses **AWS Amplify on both platforms**, and the backend uses
**Cognito's managed passwordless EMAIL_OTP** (no custom-auth Lambda triggers). The decisions
below reflect that.

---

## D1. Passwordless mechanism: Cognito **managed EMAIL_OTP** (chosen)

**Decision**: Use Cognito's **managed passwordless EMAIL_OTP** via the **`USER_AUTH`** (choice-
based) auth flow. The customer pool is on the **Essentials feature tier** (required for managed
passwordless); the app client enables the `USER_AUTH` flow with `EMAIL_OTP` as the factor, plus
`REFRESH_TOKEN_AUTH`. **No custom-auth Lambda triggers** (`Define/Create/Verify/PreSignUp`) and
**no discarded-secret workaround** — Cognito generates, sends, and validates the OTP itself, and
the account is truly passwordless.

**Rationale**: Amplify is now the client (D5), and Amplify drives managed EMAIL_OTP end-to-end
with almost no app code. Dropping the four triggers + the send-via-SES Lambda + the random-
secret hack removes the largest, most error-prone part of the earlier plan. Truly "no password
ever set" (FR-006).

**Cost note**: The Essentials tier bills per monthly active user above the free allotment —
acceptable for dev; flag for the prod cost model later.

**Alternatives considered**: Custom-auth Lambda triggers (the earlier choice) — more control
over OTP length/expiry/email copy, but four Lambdas + SES wiring + a secret workaround to
maintain. Rejected once Amplify + managed EMAIL_OTP made it unnecessary.

---

## D2. Sign-up / "email already registered" (FR-003, FR-013)

**Decision**: Sign-up and sign-in are one passwordless flow driven by Amplify. A new email is
registered (passwordless sign-up; no password parameter) and immediately verified by the same
emailed OTP; a known email simply signs in. Email is the unique account key (Cognito username
+ `email` attribute, case-insensitive). A sign-up attempt on an existing email surfaces the
"already registered → signing you in" path (FR-013 — no duplicate).

**Rationale**: The customer never chooses "sign up vs sign in" — they enter an email and get a
code, exactly as the spec describes. Managed passwordless needs no secret to satisfy any API.

---

## D3. OTP policy: length, expiry, resend (FR-010, FR-011, FR-014)

**Decision**: OTP length/expiry/validation are **managed by Cognito** (6-digit numeric;
single-use; Cognito-enforced validity window). Resend = re-initiate the EMAIL_OTP challenge via
Amplify (a fresh code; the prior is invalidated). Cognito's account-level throttling plus the
client resend cooldown cover FR-014; there are no custom attempt counters to maintain.

**Rationale**: Managed EMAIL_OTP trades fine-grained control for zero custom code. The spec's
wrong/expired/resend/too-many edges map onto Cognito's challenge errors, surfaced by Amplify.

**Trade-off**: Less control over exact OTP length/expiry/email copy than the trigger approach.
Email branding is tuned via the pool email configuration (D4), not a Lambda. Acceptable for
this slice.

---

## D4. OTP email delivery: pool email configuration (FR-002, SC-002)

**Decision**: Cognito sends the EMAIL_OTP message using the **user pool's email configuration**.
For deliverability and branding, configure **Amazon SES** as the pool's email sender
(`EmailSendingAccount = DEVELOPER` with a verified SES identity). Dev MAY start on Cognito's
default email sender (low daily cap) and move to SES.

**Rationale**: No `CreateAuthChallenge` Lambda is needed — Cognito owns sending. SES as the pool
sender is the production-grade path and meets the 30 s delivery target.

**Dev caveat**: SES starts in **sandbox** (per-region, `ap-southeast-1`): verify test recipient
addresses, or request production access. Captured in quickstart.md.

---

## D5. Mobile → Cognito: **AWS Amplify on both platforms** (Principle IV — frontend talks to Cognito directly)

**Decision**: Auth lives behind a common `expect interface AuthRepository` in `commonMain`,
with platform `actual`s:
- **Android** — Amplify Android (`com.amplifyframework:aws-auth-cognito`).
- **iOS** — **Amplify Swift** (added to the Xcode project via SPM), bridged to the iOS `actual`.

Both configure the same customer pool/app client (ids injected via BuildKonfig — D12). Amplify
drives the managed EMAIL_OTP flow (`signUp` passwordless / `signIn` with `EMAIL_OTP` →
`confirmSignIn(code)`), exposes the session/JWTs, and **owns token persistence + refresh** (D7).

**Rationale**: Amplify is the native, first-class Cognito client on each platform and removes
the hand-rolled auth/refresh/storage code the raw-Ktor approach would need. It authenticates
**directly** against Cognito (a client SDK, not a proxy) — Principle IV holds. The cost is
platform-specific auth code (normal for KMP via expect/actual) and an Amplify Swift dependency
in the Xcode project.

**Alternatives considered**: Raw Ktor→Cognito in `commonMain` (the earlier D5) — fully shared,
but we'd own the OTP flow, refresh, and secure storage by hand. Amplify Android + AWS SDK Swift
— mixed stacks. Both rejected in favor of Amplify-on-both.

**Note**: Ktor remains for the **Go hot-path API** (`GET /v1/profile`); its `Authorization:
Bearer` token comes from Amplify's current session (ktor-client-auth attaches/refreshes).

---

## D6. Go JWT validation: lestrrat-go/jwx/v2 with cached JWKS (Principle IV — backend validates per pool)

**Decision**: A Gin middleware validates the **customer pool** access token:
- Cached, auto-refreshing JWKS (`jwk.Cache`) from `.../{userPoolId}/.well-known/jwks.json`.
- Assert `iss` == the pool issuer, `token_use` == `access`, `client_id` == the customer app
  client id, `exp`/`nbf` valid; extract `sub` + email.

**Rationale**: Unchanged by the Amplify/EMAIL_OTP switch — the backend still receives a standard
Cognito JWT and pins it to the **customer pool**, which is what enforces Auth Isolation server-
side. A driver/store/admin token fails and returns 401.

---

## D7. Session persistence across restarts (FR-007, US3) — **Amplify-owned**

**Decision**: **Amplify owns the session** on both platforms — it securely persists the token
set and performs silent refresh. On launch the app calls `fetchAuthSession`; a valid session →
signed-in, an expired/revoked refresh → signed-out (US3 #3). No manual refresh/launch-gate code
beyond reading Amplify's session state.

**Rationale**: This is exactly what Amplify provides; it directly satisfies "still signed in
after force-quit" and "expired → graceful sign-out" with no custom token plumbing.

---

## D8. Secure storage — **Amplify-managed** for auth

**Decision**: Cognito tokens are stored by **Amplify** (EncryptedSharedPreferences on Android,
Keychain on iOS, internally). `multiplatform-settings` (no-arg + serialization) is retained only
for **non-auth** preferences (e.g. UI state), not tokens.

**Rationale**: Avoids hand-writing Keychain/Cipher glue; Amplify's storage is the platform-
correct default and removes the manual `TokenStore` the earlier plan needed.

---

## D9. Lazy profile creation (FR-005) — hot path, raw SQL

**Decision**: `GET /v1/profile` reads `sub` + `email` from the validated JWT, then upserts the
`customers` row (`INSERT ... ON CONFLICT (cognito_sub) DO NOTHING`) and ensures a 1:1 `profiles`
row in one transaction, returning the profile. Idempotent and concurrency-safe.

**Rationale**: "Profile exists automatically on first sign-in" with no separate write endpoint;
raw SQL via pgx (no ORM). Unchanged by the auth-mechanism switch.

---

## D10. Terraform layout, remote-state bootstrap, SSM, and region (Infra)

**Decision**:
- `infra/bootstrap/` creates the **S3 state bucket** + **DynamoDB lock table** (local state
  first, one-time).
- `infra/envs/dev/` composes `modules/cognito-customer-pool` (now: Essentials tier + managed
  EMAIL_OTP + SES pool email) and `modules/rds-postgres`, then writes SSM params
  (`/effy/dev/cognito/customer_pool_id`, `/effy/dev/cognito/customer_app_client_id`,
  `/effy/dev/db/url`).
- Backend reads SSM at boot; the **mobile app** gets pool id / app client id / region / API base
  URL via **BuildKonfig** (Gradle properties wired off the same TF outputs) — no hardcoding.
- **Region** is a single TF variable `region` = **`ap-southeast-1`** (isolates effy from `ef` in
  `ap-southeast-2`; revertable). All AWS-touching commands run under `AWS_PROFILE=ef` **and**
  `AWS_REGION=ap-southeast-1` (the `ef` profile defaults to `ap-southeast-2`).

**Region (locked)**: Deploy all effy resources to `ap-southeast-1`. Different region from `ef`
cleanly isolates every region-scoped resource (Cognito, RDS, SSM, SES, the DynamoDB lock table)
in the shared account. Region does not isolate account-global resources (IAM names, S3 bucket
namespace), so `effy-*` prefixing + separate state are kept regardless. Once the old
`ap-southeast-2` resources are deleted, flip `region` back.

---

## D11. Migrations: Goose forward-only (Tech Standards)

**Decision**: SQL migrations in `services/api/migrations/`, run by **Goose** via `make migrate`
(DB URL from SSM). Forward-only. First migration creates `customers` + `profiles`.

**Rationale**: Matches the locked standard. Unchanged.

---

## D12. Mobile architecture: Clean Architecture + MVI on ViewModel + Navigation 3 + BuildKonfig

**Decision** (refined with the adopted package set — AGP 9.0.1 / Kotlin 2.4.0 / Compose MP 1.11.1,
minSdk 24 / compileSdk + targetSdk 36):
- **State**: MVI on top of **Compose Multiplatform `ViewModel`** (`lifecycle-viewmodel` +
  `viewmodel-compose`) — each feature ViewModel exposes `StateFlow<State>` + intent functions.
- **Navigation**: **Navigation 3** (`navigation3-ui` + `lifecycle-viewmodel-navigation3`) —
  back stack as state; signed-out ↔ signed-in graphs.
- **DI**: **no Koin** (dropped) — manual construction / ViewModel factories.
- **Config**: **BuildKonfig** generates compile-time constants (`AWS_REGION`,
  `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`, `API_BASE_URL`) from Gradle properties wired
  off TF outputs — keeps Cognito config out of source.
- **Auth**: Amplify behind `expect/actual AuthRepository` (D5).
- **Layers** (`commonMain`): `domain` (entities + use cases), `data` (AuthRepository expect +
  Ktor profile client), `feature/*` (ViewModels + Compose screens), `ui/theme` (Jade + dark).

**Rationale**: Honors the locked "Clean Architecture + MVI" standard on the modern CMP stack;
ViewModel + Nav3 are the current idiomatic choices and integrate (viewmodel-navigation3) for
scoping. Lighter than a DI framework for a solo team.

---

## Summary of resolved unknowns

| Item | Resolution |
|------|-----------|
| Sign-in credential method | Passwordless EMAIL_OTP (spec clarification) |
| Passwordless mechanism | **Cognito managed EMAIL_OTP** (USER_AUTH flow, Essentials tier) — no triggers |
| New-user creation | Passwordless sign-up via Amplify; no secret; duplicate email → sign-in |
| OTP policy | Cognito-managed (6-digit, single-use); resend re-initiates; throttling + client cooldown |
| Email delivery | Cognito pool email config; SES as sender (sandbox in dev → verify recipients) |
| Mobile ↔ Cognito | **Amplify on both platforms** behind expect/actual; Ktor only for the Go API |
| Backend JWT validation | jwx/v2 cached JWKS; pin iss + client_id + token_use to customer pool |
| Session persistence | **Amplify-owned** (secure storage + silent refresh, both platforms) |
| Secure storage | Amplify-managed for tokens; multiplatform-settings for non-auth prefs |
| Profile creation | Lazy upsert on `GET /v1/profile`, raw SQL transaction |
| Mobile arch | MVI on CMP ViewModel + Navigation 3, no Koin, BuildKonfig config |
| Android SDK levels | minSdk 24 / compileSdk 36 / targetSdk 36 (desugaring on) |
| Remote state / region | S3+DynamoDB via bootstrap; all AWS in `ap-southeast-1` (`AWS_PROFILE=ef`) |
| Config delivery | SSM → Go service; BuildKonfig (from TF outputs) → mobile app |
