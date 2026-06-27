# Auth Flow Contract: Passwordless EMAIL_OTP via Amplify (Customer Pool)

This is the contract between the **KMP app (AWS Amplify on both platforms)** and **Cognito**,
and between the **Go service** and the **token**. Cognito's **managed passwordless EMAIL_OTP**
(USER_AUTH flow) is used — there are **no custom-auth Lambda triggers**. Principle IV holds:
Amplify authenticates **directly** against Cognito (a client SDK, not a proxy).

The app configures Amplify with the customer pool id, app client id, and region — injected at
build time via **BuildKonfig** (`AWS_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`),
sourced from Terraform outputs (no hardcoding).

Auth lives behind a common `expect interface AuthRepository` in `commonMain`; the Android
`actual` uses Amplify Android, the iOS `actual` bridges Amplify Swift. The interface (intent):

```text
suspend fun requestCode(email): RequestCodeResult        // sign up if new, else sign in; sends OTP
suspend fun verifyCode(code): AuthResult                 // confirm OTP → signed in (tokens persisted)
suspend fun currentSession(): SessionState               // restore on launch (Amplify-managed)
suspend fun signOut()
suspend fun accessToken(): String?                       // for the Bearer header to the Go API
```

---

## 1. Sign-up / sign-in (unified, passwordless) — FR-001…FR-004, FR-006, FR-013

```text
App (Amplify)                         Cognito (customer pool, managed EMAIL_OTP)
 │  enter email
 │  requestCode(email)
 │    └─ Amplify signIn(username=email, authFlowType=USER_AUTH,
 │                      preferredChallenge=EMAIL_OTP)
 │       (if user does not exist → Amplify signUp(email, no password) then signIn)
 │  ───────────────────────────────────────────────────────────────────────────▶
 │                                   Cognito generates OTP, emails it (pool email config / SES)
 │  ◀── challenge: CONFIRM_SIGN_IN_WITH_EMAIL_OTP (+ codeDeliveryDetails) ─────────
 │  enter code
 │  verifyCode(code)  →  Amplify confirmSignIn(code)
 │  ───────────────────────────────────────────────────────────────────────────▶
 │  ◀── AuthSession { idToken, accessToken, refreshToken } (Amplify persists securely) ──
 │  signed in → navigate home
```

- **Already registered** (FR-013): a known email simply signs in; a duplicate sign-up is
  resolved to sign-in. Email is the unique key (case-insensitive).
- **No password** is ever set, requested, or stored (managed passwordless).

### Errors → UI states (FR-010/011/012/014)

| Condition | Amplify signal | UI message |
|-----------|----------------|-----------|
| Wrong code (retryable) | `confirmSignIn` returns not-done / `CodeMismatchException` | "That code isn't right — try again." |
| Code expired | `ExpiredCodeException` | "This code has expired. Request a new one." |
| Too many attempts | `LimitExceededException` / `TooManyRequestsException` | "Too many attempts. Request a new code shortly." |
| Resend | re-invoke `requestCode` (client cooldown ≥30 s) | "We sent a new code." (prior code invalid) |
| Invalid email format | client-side, pre-call | "Enter a valid email address." |

---

## 2. Session restore (app launch / token expiry) — FR-007, US3

```text
App launch → Amplify.fetchAuthSession()
   ├─ isSignedIn && valid → SIGNED_IN (Amplify silently refreshes the access token as needed)
   └─ not signed in / refresh expired or revoked → SIGNED_OUT (graceful, US3 #3)
```

Amplify owns secure token storage and silent refresh on both platforms — no manual token
plumbing. "Stay signed in across restarts" = a valid Amplify session.

## 3. Sign out — FR-008, FR-009

`AuthRepository.signOut()` → `Amplify.Auth.signOut()` clears the local session (optionally
global sign-out to revoke server-side). App returns to SIGNED_OUT; protected calls now have no
token.

---

## 4. Token → backend contract (what the Go service asserts) — unchanged

The app sends `Authorization: Bearer <accessToken>` (from Amplify's session) to
`GET /v1/profile`. The service MUST:

1. Verify RS256 against the **customer pool** JWKS (`.../{poolId}/.well-known/jwks.json`,
   cached + auto-refreshing).
2. Assert claims:
   - `iss` == `https://cognito-idp.{region}.amazonaws.com/{customerPoolId}`
     (for effy dev, `{region}` = `ap-southeast-1`)
   - `token_use` == `access`
   - `client_id` == the **customer** app client id
   - `exp` / `nbf` valid (small clock-skew leeway)
3. Extract `sub` → `cognito_sub` and the email claim for lazy profile creation.
4. On any failure → **401** (`{code:"unauthorized"}`); never leak which check failed.

**Isolation guarantee**: a token minted by the driver/store/admin pools fails step 2 (`iss` /
`client_id` mismatch) → 401. No cross-pool acceptance, no proxy.
