# Contract — Cognito Custom-Auth Trigger Interface

**Feature**: 035-six-digit-otp · **Status**: binding · **Date**: 2026-08-03

This slice exposes **no HTTP route**. Its interface is the contract between Amazon Cognito and four
Lambda functions, plus the client-side auth-flow constant on six surfaces. Both halves are pinned here
because a drift in either locks people out of the platform.

⚠ The trigger functions have **no `events:` block** in `serverless.yml`. They are invoked by Cognito,
not by the gateway — exactly like the existing `preSignUp` trigger in `apis/edge-api/customer`.

---

## 1. Trigger event/response shapes

Verified against `@types/aws-lambda@8.10.162` (installed) and the AWS developer guide.

⚠ **The shipped `ChallengeName` union is stale** — it omits `EMAIL_OTP` and `NEW_PASSWORD_REQUIRED`,
both of which AWS documents, and AWS warns that *"element names might be added … stricter input
validation can cause your functions to fail."* **Treat `challengeName` as an open `string`.** Widening
it locally is part of this slice.

### Common to all triggers

```ts
interface BaseTriggerEvent<T extends string> {
  version: string;
  region: string;
  userPoolId: string;   // ⚠ this is what lets ONE function serve four pools (R8)
  triggerSource: T;
  userName: string;
  callerContext: { awsSdkVersion: string; clientId: string };  // ⚠⚠ NO IP ADDRESS — see §4
  request: {};
  response: {};
}
```

### DefineAuthChallenge

```ts
request: {
  userAttributes: Record<string, string>;
  session: Array<{
    challengeName: string;          // treat as open string, not a union
    challengeResult: boolean;       // ⚠ failures are APPENDED, not replaced
    challengeMetadata?: string;     // ⚠ only meaningful when challengeName === "CUSTOM_CHALLENGE"
  }>;                               // chronological order
  userNotFound?: boolean;
  clientMetadata?: Record<string, string>;   // ⚠ absent on the InitiateAuth-driven invocation
}
response: { challengeName?: string; issueTokens: boolean; failAuthentication: boolean }
```

**Binding rules**:
- `issueTokens: true` **MUST** additionally assert `session[last].challengeName === "CUSTOM_CHALLENGE"`
  **and** that every element of `session` is `CUSTOM_CHALLENGE`. AWS states this explicitly: *"always
  check `challengeName` … and verify that it matches the expected value."* Without it, tokens can be
  issued for a challenge this platform did not author.
- `issueTokens` **MUST** be false when `request.userNotFound` is true.
- `session.length >= 3` → `failAuthentication: true`. ⚠ Lengths 0, 1, 2 issue a challenge — **exactly
  three tries**.
- The branch shape **MUST** be identical whether or not `userNotFound` is set (FR-016).

### CreateAuthChallenge

```ts
request: {
  userAttributes: Record<string, string>;
  challengeName: string;
  session: Array<ChallengeResult>;
  userNotFound?: boolean;
  clientMetadata?: Record<string, string>;   // ⚠ absent here on the first invocation
  // ⚠ NOTE: there is NO privateChallengeParameters on the request. It is response-only and
  //         starts EMPTY on every invocation, including retries after a wrong answer.
}
response: {
  publicChallengeParameters: Record<string, string>;   // → client-visible as API ChallengeParameters
  privateChallengeParameters: Record<string, string>;  // → verify trigger only, never client-visible
  challengeMetadata: string;                           // → next Create invocation, via session[]
}
```

**Binding rules**:
- `session.length === 0` → **generate** a new code, send one email, increment the counter.
- `session.length > 0` → ⚠ **REUSE** the digest parsed from `session[last].challengeMetadata`.
  **MUST NOT** generate, **MUST NOT** send another email, **MUST NOT** increment the counter.
- `publicChallengeParameters` **MUST** contain only `{ maskedDestination }`. Never the code, never the
  digest, never an unmasked address.
- `challengeMetadata` format is pinned: `"v1:<issuedAtEpochSeconds>:<hmacSha256Hex>"`. ⚠ **Never
  cleartext** — this deviates from the AWS sample deliberately (research R1).
- On `userNotFound` → identical shape, **no email to a real inbox**, but ⚠ **still call SES** (mailbox
  simulator) so the latency distribution matches (FR-016).
- ⚠ **MUST NOT throw on a user-data condition.** Cognito returns trigger errors to the client as
  `{{[trigger]}} failed with error {{[error text]}}` — a thrown message is user-visible and an
  existence oracle.

### VerifyAuthChallengeResponse

```ts
request: {
  userAttributes: Record<string, string>;
  privateChallengeParameters: Record<string, string>;  // from the IMMEDIATELY preceding Create
  challengeAnswer: string;
  userNotFound?: boolean;
  clientMetadata?: Record<string, string>;             // present (RespondToAuthChallenge-driven)
}
response: { answerCorrect: boolean }
```

**Binding rules**: pure comparison, no I/O. Reject unless the answer is exactly six digits; recompute
the HMAC; compare with `crypto.timingSafeEqual` over equal-length buffers; reject when
`now > issuedAt + 300`. On `userNotFound` → `answerCorrect: false`, ⚠ **after** running the same
constant-time compare against a dummy digest so timing matches.

### PostAuthentication

```ts
request: { userAttributes: Record<string, string>; newDeviceUsed: boolean; clientMetadata?: ... }
response: {}
```

Sets `email_verified = "true"` via `AdminUpdateUserAttributes` when it is not already true.
⚠ Idempotent, and **MUST NOT** throw — a failure here must not break a sign-in that already succeeded,
but **MUST** emit `otp_email_verify_failed` so the silent-failure mode in R7 is visible.

---

## 2. Terraform wiring

```hcl
lambda_config {
  define_auth_challenge          = <arn>
  create_auth_challenge          = <arn>
  verify_auth_challenge_response = <arn>
  post_authentication            = <arn>
  pre_sign_up                    = <arn>   # customer pool only (011, extended by R4a)
}
```

⚠ **Ordering is load-bearing**: the Lambdas must be deployed *before* `lambda_config` references them
— Cognito validates the trigger on `UpdateUserPool`. This is the same two-stage dance already
documented for `pre_sign_up` (`infra/envs/dev/auth-customer.tf:126-129`).

**Invoke permission**: one `aws_lambda_permission` per (function, pool) — **16 total**, `principal =
"cognito-idp.amazonaws.com"`, `source_arn` pinned to a **single** pool ARN. ⚠ `ArnLike` would permit a
wildcard; a wildcard would silently admit any future pool and is forbidden here.

### App client flows — the exact target state

| Client | `explicit_auth_flows` |
|---|---|
| driver, shop, back-office (`*-app`) | `ALLOW_CUSTOM_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH` |
| `shop_mobile` | `ALLOW_CUSTOM_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH` |
| customer (`*-app`), `customer_mobile` | `ALLOW_CUSTOM_AUTH`, `ALLOW_USER_SRP_AUTH`, `ALLOW_USER_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH` |

⚠ The customer pool retains `ALLOW_USER_AUTH` **only** because passwordless `SignUp` requires it
(research R4b), which leaves the managed 8-digit flow reachable by raw API on that pool. Spike T003
tests whether a sign-up-only client closes it.

**Also required, on every client**: `prevent_user_existence_errors = "ENABLED"` (⚠ defaults to
`LEGACY`; already set — must not regress) and `auth_session_validity = 5` (⚠ never below 5, or the
session dies before the third attempt).

⚠ **Non-negotiable pre-apply check**: `make plan ENV=dev`, then grep for `must be replaced` /
`forces replacement` on any `aws_cognito_user_pool` or `aws_cognito_user_pool_client`. **If present,
stop.** Only `username_attributes`, `alias_attributes` and `username_configuration.case_sensitive`
force replacement on a pool, and `generate_secret` / `user_pool_id` on a client — none of which this
slice touches — but the check is mandatory (FR-030).

---

## 3. Client contract — the auth-flow constant

The auth flow is a **code literal on six surfaces**, never configuration. All must change together.

| Surface | File | From | To |
|---|---|---|---|
| shop-web + back-office | `packages/web-kit/src/auth/otp.ts:15` | `{authFlowType:"USER_AUTH", preferredChallenge:"EMAIL_OTP"}` | `{authFlowType:"CUSTOM_WITHOUT_SRP"}` |
| customer-web | `apps/customer-web/app/(auth)/_lib/auth-actions.ts:103` | same | same |
| customer-mobile | `.../androidMain/.../AmplifyAuthDriver.kt:119-123` | `USER_AUTH` + `preferredFirstFactor(EMAIL_OTP)` | `AuthFlowType.CUSTOM_AUTH_WITHOUT_SRP` |
| shop-mobile | `.../androidMain/.../AmplifyAuthDriver.kt:69-73` | same | same |
| customer-mobile iOS | `iosApp/iosApp/SwiftAuthBridge.swift:137-139` | `.userAuth(preferredFirstFactor:.emailOTP)` | `.customWithoutSRP` |
| shop-mobile iOS | `iosApp/iosApp/SwiftAuthBridge.swift:36-46` | same | same |

⚠ **`CUSTOM_WITHOUT_SRP` only — never `CUSTOM_WITH_SRP`.** amplify-android #2331/#2566 record the
WITH_SRP variant returning `AuthSignInStep.DONE`, i.e. **issuing tokens without presenting the
challenge**. Fixed twice, reported recurring. A test asserts the first `signIn` returns the challenge
step and never `DONE`.

### Step names — the five breakage sites

| # | Site | Failure mode |
|---|---|---|
| 1 | `packages/web-kit/src/auth/otp.ts:17-24` | `switch` with a **throwing `default`** — breaks shop-web **and** back-office at once. *Loud.* |
| 2 | both `AmplifyAuthDriver.kt` `mapSignIn` | `else -> Failed(Unexpected)` — ⚠ **no compile error**, runtime dead end. *Silent.* |
| 3 | both `SwiftAuthBridge.swift` `mapSignIn` | `default: "unexpected"`. *Silent.* |
| 4 | `IosAuthDriver.kt` `BridgeAuthResult.outcome` | stringly-typed; needs a new constant in two files per app, no compiler help. *Silent.* |
| 5 | `apps/customer-web/.../auth-actions.ts` | ⚠ **no `switch` on `signInStep` at all** — fails later and more confusingly. |

New step values: web `CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE` · Android
`AuthSignInStep.CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE` · iOS `.confirmSignInWithCustomChallenge`.

⚠ **Mitigation for the three silent sites**: model the new step in each app's `AuthStep` **sealed
interface**, so every `when` becomes non-exhaustive at **compile time** rather than falling through an
`else` at runtime. That is the difference between a build error and a shopper stuck on a dead screen.

⚠ **`mobile-guard.sh` bans the raw Cognito client** (`cognitoidentityprovider`,
`CognitoIdentityProviderClient`), allowlist deliberately empty. Mobile **must** go through
`Amplify.Auth.signIn`/`confirmSignIn`.

⚠ **`autoSignIn` does not support `CUSTOM_WITHOUT_SRP`** (Amplify documents only `USER_AUTH`). Sign-up
calls `signUp` then `signIn` in the same handler — one code screen for the user, two round trips.

---

## 4. ⚠ Per-source rate limiting is NOT a Lambda contract

`callerContext` has exactly two fields and **neither is an IP address**. `clientMetadata` is no
substitute: AWS documents that `InitiateAuth` does **not** pass it to `CreateAuthChallenge` or
`DefineAuthChallenge`, and it is client-controlled and unvalidated in any case.

**FR-013 is delivered by AWS WAF**: `aws_wafv2_web_acl` + `aws_wafv2_web_acl_association` per pool,
with a rate-based rule scoped by the `x-amzn-cognito-operation-name` and `x-amzn-cognito-client-id`
headers Cognito forwards. Blocked requests surface as `ForbiddenException`.

⚠ WAF **cannot** see email addresses (PII is withheld from it), so **FR-012 (per-address) and FR-013
(per-source) are two mechanisms, not one**.

---

## 5. Invariants a test must pin

| # | Invariant | Requirement |
|---|---|---|
| 1 | Generated code matches `^[0-9]{6}$`, leading zeros preserved | FR-001, FR-007 |
| 2 | A wrong answer does **not** trigger a second email or a second counter increment | FR-010, FR-012 |
| 3 | The 4th submission fails; the 3rd is still allowed | FR-011 |
| 4 | `issuedAt + 301s` is refused even inside a live session | FR-008 |
| 5 | `issueTokens` is false when any session element is not `CUSTOM_CHALLENGE` | R5 |
| 6 | `issueTokens` is false when `userNotFound` | FR-016 |
| 7 | `challengeMetadata` never contains six consecutive plaintext digits | FR-014 |
| 8 | `publicChallengeParameters` contains only `maskedDestination` | FR-014 |
| 9 | Verify's compare runs on the `userNotFound` path too | FR-016 |
| 10 | No trigger throws on a user-data condition | FR-016, FR-028 |
| 11 | The counter is written for unknown addresses | FR-016 |
| 12 | A retried `CreateAuthChallenge` for one session increments the counter once | R6 |
| 13 | The first `signIn` returns the challenge step, **never** `DONE` | R10 |
| 14 | A cross-language byte-identical fixture pins the step-name strings | Principle II; 028's precedent |
