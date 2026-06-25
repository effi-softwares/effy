# Phase 0 Research: Customer Auth & Onboarding

All decisions below resolve the Technical Context for the plan. No blocking NEEDS
CLARIFICATION remained from the spec (sign-in method was clarified to **passwordless**); a few
defaults are confirmed here and flagged "confirm at implement" where an account-specific value
is needed.

---

## D1. Passwordless mechanism: custom-auth Lambda triggers (chosen) vs native EMAIL_OTP

**Decision**: Implement passwordless EMAIL_OTP via **Cognito custom-auth Lambda triggers**
(`DefineAuthChallenge`, `CreateAuthChallenge`, `VerifyAuthChallengeResponse`, plus
`PreSignUp`), as the user directed. The pool's app client enables `ALLOW_CUSTOM_AUTH` and
`ALLOW_REFRESH_TOKEN_AUTH` only.

- `DefineAuthChallenge` — orchestrates the flow: issue a `CUSTOM_CHALLENGE`; on correct answer
  issue tokens; after N failed attempts, fail the auth session (enforces FR-014).
- `CreateAuthChallenge` — generates a numeric OTP, stores it in `privateChallengeParameters`
  (never sent to the client), records `expiresAt`, and emails the code via SES.
- `VerifyAuthChallengeResponse` — compares the submitted code to the private OTP and checks
  expiry → sets `answerCorrect` (FR-011 single-use/expiry; FR-012 wrong/expired feedback).
- `PreSignUp` — auto-confirms the user and auto-verifies email so a brand-new email can proceed
  straight into the OTP challenge with no separate confirmation step (FR-003/FR-004).

**Rationale**: Matches the user's explicit instruction and the locked platform pattern. Keeps
all OTP policy (length, expiry, attempt caps, copy) in code we control, which the spec's
error-feedback and rate-limit requirements lean on.

**Alternatives considered**:
- **Native managed passwordless `EMAIL_OTP` (USER_AUTH flow)** — Cognito sends/validates the
  OTP itself; **no triggers, no SES wiring, and literally no password ever** (cleanest fit for
  "no password ever set"). Requires the Essentials feature tier. **Recommended** if the team
  later wants to drop the trigger/SES surface; flagged in plan Complexity Tracking. Not chosen
  now because the user specified the custom-auth-trigger approach.
- **Amplify Auth** — heavier client dependency; KMP support is immature. Rejected (we call
  Cognito directly from Ktor — see D5).

---

## D2. New-user creation & "email already registered" (FR-003, FR-013)

**Decision**: "Sign up" and "sign in" are the **same client flow**. The app first attempts the
custom-auth challenge for the email; if Cognito reports the user does not exist, the app calls
Cognito **`SignUp`** with the email as username and a **client-generated, high-entropy random
secret that is never displayed, stored, or reused**, then immediately starts the custom-auth
challenge. `PreSignUp` auto-confirms so no email-link step is needed.

- Duplicate emails: `SignUp` on an existing username returns `UsernameExistsException` → the
  app treats it as "already registered, signing you in" and proceeds to the OTP challenge for
  the existing account (FR-013 — no duplicate; guided to sign-in).
- Email is the unique account key (Cognito username + `email` attribute, case-insensitive).

**Rationale**: A unified flow means the customer never picks "sign up vs sign in" — they enter
an email and get a code, exactly as the spec describes. The random secret exists only to
satisfy the `SignUp` API and is unrecoverable, preserving the passwordless UX.

**Alternatives considered**: `AdminCreateUser` (server-side) — sets a temporary password and
`FORCE_CHANGE_PASSWORD` status that conflicts with custom-auth; rejected. Native EMAIL_OTP
avoids the secret entirely (see D1).

---

## D3. OTP policy: length, expiry, single-use, resend, rate limiting (FR-010, FR-011, FR-014)

**Decision**:
- 6-digit numeric code; **expiry 10 minutes**; **single-use** (cleared on success or on issuing
  a new code).
- **Max 3 wrong attempts** per auth session before `DefineAuthChallenge` fails it; the app then
  restarts the flow.
- **Resend cooldown 30 s** enforced client-side; a resend starts a fresh `InitiateAuth`
  session, invalidating the prior code.
- Cognito account-level request throttling provides a backstop against abuse.

**Rationale**: Standard, user-friendly OTP ergonomics that satisfy SC-001 (≤2 min) and the
spec's edge cases (wrong/expired/resend/too-many-attempts) without inventing a custom store —
state lives in the Cognito auth session.

**Confirm at implement**: exact attempt count / cooldown are tunable; these are sane defaults.

---

## D4. OTP email delivery: Amazon SES (FR-002, SC-002)

**Decision**: `CreateAuthChallenge` sends the OTP through **SES v2** from a verified sender
identity provisioned in dev. Email template is plain + minimal (code, expiry, "didn't request
this?" line).

**Rationale**: Custom-auth challenges must send their own email; Cognito's built-in emailer
only covers its default messages. SES is the platform-standard sender and meets the 30 s
delivery target.

**Dev caveat (important)**: SES starts in **sandbox mode** — it can only send to **verified
recipient addresses**. For dev testing, either verify each tester's email in SES or request
production access. This is captured as an infra task and called out in quickstart.md.

---

## D5. Mobile → Cognito without Amplify: raw Ktor calls (Principle IV — frontend talks to Cognito directly)

**Decision**: The KMP app calls the **Cognito Identity Provider JSON API directly via Ktor**:
- `InitiateAuth` with `AuthFlow=CUSTOM_AUTH` → returns a `Session` + `CUSTOM_CHALLENGE`.
- `RespondToAuthChallenge` with `ChallengeName=CUSTOM_CHALLENGE` and `ChallengeResponses`
  (`USERNAME`, `ANSWER=<code>`) → returns the token set on success, or a new challenge/session.
- `SignUp` for first-time users (D2). `InitiateAuth REFRESH_TOKEN_AUTH` for silent refresh.

Requests are unauthenticated POSTs to `https://cognito-idp.{region}.amazonaws.com/` with header
`X-Amz-Target: AWSCognitoIdentityProviderService.<Action>` and `Content-Type:
application/x-amz-json-1.1`. **No SigV4 signing** is needed because the app client has **no
client secret** (public client).

**Rationale**: Keeps the dependency surface tiny and fully cross-platform (one Ktor client in
`commonMain`), and honors Principle IV literally — the frontend authenticates against Cognito
directly, no proxy. SigV4 in KMP is the main thing this avoids.

**Alternatives considered**: AWS SDK for Kotlin (JVM-leaning, awkward in `commonMain`) and
Amplify (immature KMP) — both rejected.

---

## D6. Go JWT validation: lestrrat-go/jwx/v2 with cached JWKS (Principle IV — backend validates per pool)

**Decision**: A Gin middleware validates the **customer pool** access token:
- Fetch `https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/jwks.json` into a
  **cached, auto-refreshing** `jwk.Cache` (lestrrat-go/jwx/v2).
- Verify RS256 signature, then assert claims: `iss` == the pool issuer URL, `token_use` ==
  `access`, `client_id` == the customer app client id, `exp`/`nbf` valid.
- Extract `sub` (stable subject) and `email` for downstream profile use.

**Rationale**: `jwx/v2` is the de-facto Go library for JWKS-backed validation with built-in key
caching/rotation; pinning `iss` + `client_id` to the **customer pool** is what enforces Auth
Isolation server-side — a driver/store/admin token fails validation.

**Alternatives considered**: `coreos/go-oidc` (heavier, OIDC-discovery oriented) and hand-rolled
JWKS parsing (error-prone) — rejected.

---

## D7. Session persistence across restarts (FR-007, US3)

**Decision**: On successful auth, persist the **refresh token** (and current access/id tokens)
to device **secure storage**. On app launch, if a refresh token exists, perform a **silent
refresh** (`REFRESH_TOKEN_AUTH`) to mint a fresh access token before showing the home stub; if
refresh fails (revoked/expired), drop to the signed-out state gracefully (US3 scenario 3).
- **Refresh token lifetime ≈ 30 days** with rotation; access/id tokens 60 min (Cognito
  defaults). "Stay signed in" = valid refresh token.

**Rationale**: This is the standard Cognito long-session pattern and directly satisfies "still
signed in after force-quit" and "session expired → graceful sign-out".

**Confirm at implement**: 30-day refresh lifetime is the spec's "order of weeks" default
(spec Assumptions); tunable on the app client.

---

## D8. Secure storage abstraction (cross-platform)

**Decision**: Use **`russhwolf/multiplatform-settings`** with platform-encrypted backends —
`KeychainSettings` (iOS Keychain) and `EncryptedSharedPreferences` (Android Jetpack Security) —
behind a `TokenStore` interface in `commonMain`. If a needed capability is missing, fall back
to a thin `expect/actual TokenStore`.

**Rationale**: Meets the spec/plan requirement (Keychain on iOS, encrypted prefs on Android)
with a single shared interface and minimal platform code; avoids hand-writing Keychain/Cipher
glue twice.

---

## D9. Lazy profile creation (FR-005) — hot path, raw SQL

**Decision**: `GET /v1/profile` reads `sub` + `email` from the validated JWT, then in a single
transaction **upserts** the `customers` row (`INSERT ... ON CONFLICT (cognito_sub) DO NOTHING`)
and ensures a 1:1 `profiles` row, returning the profile. Idempotent and concurrency-safe via the
unique constraint.

**Rationale**: "Profile exists automatically on first sign-in" with no separate write endpoint;
the read path self-heals the first time. Raw SQL via pgx (no ORM) per Tech Standards.

**Alternatives considered**: A Cognito `PostAuthentication` trigger writing to RDS — couples
auth infra to the DB and needs VPC access from the Lambda; rejected in favor of lazy-create on
the hot path.

---

## D10. Terraform layout, remote-state bootstrap, and SSM (Infra)

**Decision**:
- `infra/bootstrap/` creates the **S3 state bucket** (versioned, encrypted) + **DynamoDB lock
  table**. It runs with **local state first**, then optionally migrates its own state into the
  bucket. One-time, per the chicken-and-egg of remote state.
- `infra/envs/dev/` uses the S3 backend and composes `modules/cognito-customer-pool` +
  `modules/rds-postgres`, then writes **SSM Parameter Store** entries:
  `/effy/dev/cognito/customer_pool_id`, `/effy/dev/cognito/customer_app_client_id`,
  `/effy/dev/db/url` (SecureString for the URL).
- The Go service reads these at boot via `aws-sdk-go-v2/ssm` (no secrets in code/repo).
- **Region** is a single Terraform variable `region`, set to **`ap-southeast-1`** for effy
  (see "Region (locked)" below). The Go service + KMP app read region from SSM/config — never
  hardcoded — so reverting is a one-variable change.
- **All** AWS-touching Terraform/CLI runs under `AWS_PROFILE=ef` **and**
  `AWS_REGION=ap-southeast-1`. The `ef` profile's default region is `ap-southeast-2`, so region
  MUST be set explicitly or commands hit the wrong region and won't find effy's resources.

**Rationale**: Standard, safe multi-env Terraform with a fresh effy-owned backend; SSM keeps the
"no hardcoded secrets" constraint and gives the Go service one config source.

**Region (locked)**: Deploy all effy resources to **`ap-southeast-1` (Singapore)**. The existing
`ef` platform runs in **`ap-southeast-2` (Sydney)**, so a different region cleanly isolates every
region-scoped resource (Cognito, RDS, SSM, Lambda, SES, the DynamoDB lock table) — no collisions
while both platforms share the same AWS account. This is **revertable**: once the old
`ap-southeast-2` resources are deleted, flip the `region` variable back to `ap-southeast-2` (the
issuer/JWKS URLs and SES endpoint follow the variable automatically). Region does **not** isolate
account-global resources (IAM names, the S3 bucket namespace), so `effy-*` name prefixing +
separate state are kept regardless. Keep `region` per-env so prod can pick the region matching
the user base — the hot-path latency budget is real (Principle III).

---

## D11. Migrations: Goose forward-only (Tech Standards)

**Decision**: SQL migrations in `services/api/migrations/`, run by **Goose** via
`make migrate` against the dev DB (URL from SSM). Forward-only — no relied-upon down
migrations. First migration creates `customers` + `profiles` (see data-model.md).

**Rationale**: Matches the locked standard; embedding the migrations in the Go binary is an
option for later deploy, but the Makefile target is enough for this slice.

---

## D12. Mobile architecture: Clean Architecture + MVI + navigation

**Decision**: Layers in `commonMain` — `domain` (entities + use cases), `data` (Ktor Cognito
client, `TokenStore`, profile repository), `feature/*` (MVI stores). Each MVI store is a
`StateFlow<State>` + `onIntent(Intent)` reducer driving effects; UI is Compose Multiplatform.
Navigation via **Compose Multiplatform Navigation**; DI via **Koin**.

**Rationale**: Honors the locked "Clean Architecture + MVI" standard with the lightest moving
parts for a solo team; a hand-rolled `StateFlow` MVI store avoids a heavyweight framework while
keeping unidirectional data flow testable. Orbit-MVI/MVIKotlin/Decompose are viable but heavier;
revisit if navigation complexity grows.

---

## Summary of resolved unknowns

| Item | Resolution |
|------|-----------|
| Sign-in credential method | Passwordless EMAIL_OTP (spec clarification) |
| New-user creation | Unified flow; `SignUp` + discarded random secret + `PreSignUp` auto-confirm |
| OTP length/expiry/attempts/resend | 6 digits / 10 min / 3 attempts / 30 s cooldown (tunable) |
| Email delivery | SES v2 (dev sandbox → verify test recipients) |
| Mobile↔Cognito | Raw Ktor calls (no SigV4, public app client, no Amplify) |
| Backend JWT validation | lestrrat-go/jwx/v2, cached JWKS, pin iss + client_id to customer pool |
| Session persistence | Refresh token in secure storage; silent refresh on launch; ~30-day refresh |
| Secure storage | multiplatform-settings (Keychain / EncryptedSharedPreferences) |
| Profile creation | Lazy upsert on `GET /v1/profile`, raw SQL transaction |
| Remote state | Fresh effy S3 + DynamoDB via `infra/bootstrap/` |
| Config delivery | SSM Parameter Store → Go service at boot |
| AWS region | **`ap-southeast-1`** (TF `region` var) — isolates effy from `ef` in `ap-southeast-2`; revertable later |
| AWS profile / region | `AWS_PROFILE=ef` **+ `AWS_REGION=ap-southeast-1`** on every AWS-touching command (profile default is `ap-southeast-2`) |
