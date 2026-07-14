# Contract — `AuthDriver`, the platform boundary

**The security boundary of this slice.** Two SDKs, two languages, **one interface** — and "they behave identically"
is a **claim**, not a fact, until it is exercised on both platforms.

---

## Why it is an interface and not `expect class`

Two independent reasons, either of which is decisive:

1. **Amplify Swift is unreachable from Kotlin.** Kotlin/Native interops with **Objective-C and C**. Amplify Swift is
   **Swift-only**. An `iosMain` Kotlin file **cannot call it at all**. The only direction that works is: declare the
   interface in `commonMain` (it exports to Objective-C), **implement it in Swift**, and **inject it into the shared
   module** from the iOS entry point.
2. **`expect class` is Beta and the docs steer away from it** — the compiler warns without
   `-Xexpect-actual-classes`, and Kotlin's own guidance is *"use interfaces and factory functions."*

```
commonMain   interface AuthDriver                       ← pure Kotlin, no SDK types
androidMain  class AmplifyAuthDriver : AuthDriver       ← Amplify Android (Kotlin/JVM)
iosApp/      class SwiftAuthDriver: AuthDriver          ← Amplify SWIFT — lives in the iOS app, injected in
```

`expect fun` is still used for **tiny leaf things** (the Ktor engine, a clock). **Never `expect class`** for
anything with state or a lifecycle.

---

## The interface

```kotlin
interface AuthDriver {
    val sessionChanges: Flow<Unit>                       // the SDK dropped the session out from under us (see below)

    suspend fun currentSession(forceRefresh: Boolean = false): Session?

    // registration — TWO routes, and only two
    suspend fun signUpWithPassword(email: String, password: String, given: String, family: String): AuthStep
    suspend fun signUpPasswordless(email: String, given: String, family: String): AuthStep
    suspend fun confirmSignUp(email: String, code: String): AuthStep      // → Done (auto-sign-in)

    // sign-in — TWO routes, and only two
    suspend fun signInWithPassword(email: String, password: String): AuthStep   // SRP — the password never goes on the wire
    suspend fun signInWithEmailOtp(email: String): AuthStep                     // → NeedsOtp
    suspend fun confirmOtp(code: String): AuthStep                              // → Done

    // recovery — STARTS here, FINISHES at the backend (see below)
    suspend fun startPasswordReset(email: String): AuthStep                     // → NeedsOtp

    // sign out — LOCAL ONLY
    suspend fun signOut()
}

data class Session(val sub: String, val idToken: String, val accessToken: String, val expiresAt: Instant)

sealed interface AuthStep {
    data class Done(val session: Session) : AuthStep
    data class NeedsOtp(val destination: String) : AuthStep
    data class NeedsSignUpConfirmation(val email: String) : AuthStep
    data class Failed(val error: AuthError) : AuthStep
}
```

`Session` carries **both tokens** because every account route needs both (see the
[backend contract](edge-api-customer.contract.md) — the two-token protocol).

---

## ⚠ What is deliberately NOT on this interface

**This is the most important part of the contract.** The absences are the security property.

| Absent | Why |
|---|---|
| **`updatePassword` / `changePassword`** | Cognito's `ChangePassword` **permits omitting the previous password when the user has none** — confirmed verbatim in AWS's API reference — so **any bearer of a valid access token can silently plant a permanent password on a passwordless account**, and **IAM cannot stop it**. That is the entire reason 012 exists. Password writes go to the **backend**, which verifies a **freshly emailed code in the same request that writes the password**. **If this method existed on the driver, the vulnerability would be one call away, on the surface most likely to reintroduce it.** |
| **`globalSignOut`** | The backend orders it together with the DB write and the email notification. A driver-level call would revoke sessions and leave the record wrong. |
| **`confirmResetPassword`** | Would **bypass breach screening** and leave `has_password` **permanently wrong**. Recovery *starts* here and **finishes at `POST /customer/v1/password/reset-confirm`**. The web app **removed** this exact call for this exact reason — we will not re-add it on a second surface. |
| **`escapeHatch` / `getEscapeHatch`** | Both SDKs expose the raw `CognitoIdentityProviderClient`, from which **every forbidden call above becomes reachable**. |

**Amplify's high-level API *happens* to block the dangerous `updatePassword` call** — both platforms type the old
password as non-optional. **That is a type-level accident, not a security guard, and it MUST NOT be relied on.** The
escape hatch is right there.

### The build guard (FR-024's real enforcement)

A build check fails on any reference to `escapeHatch` / `getEscapeHatch` / a direct `cognitoidentityprovider` import
**outside the driver's allowlist** (which is empty).

This is the **KMP equivalent of 011's Amplify quarantine (FR-006)** and exists for the same reason: **the dangerous
path is reachable, so touching it must be a build failure, not a code-review catch.**

**And it must be proved by deliberately breaking it.** 011 shipped a quarantine guard that reported *clean while
Amplify was on the home page* — because it matched only direct imports. The lesson, recorded in that slice's
research: **break a guard the way it will actually break.** That is a task here, not a hope.

---

## The three asymmetries the implementations must absorb

`commonMain` must never learn about any of these.

| # | Android | Swift |
|---|---|---|
| 1 | Sign-in options **require an `Activity`** (`callingActivity`) | No analogue |
| 2 | Builder + a separate `preferredFirstFactor(EMAIL_OTP)` setter | The factor is an **associated value on the enum case**: `.userAuth(preferredFirstFactor: .emailOTP)` |
| 3 | Tokens in `EncryptedSharedPreferences` (Keystore master key) — **Auto Backup copies them off-device unless excluded**; a Keystore failure **silently signs the customer out** | Keychain, `…ThisDeviceOnly`, data-protection keychain — **backup-excluded by construction, zero config** |

**(1)** → the driver takes an opaque `PlatformContext` supplied per target.
**(3)** → **`sessionChanges` exists because of Android.** Amplify Android can drop the session **without the app
asking** (broken-Keystore devices: the master key is recreated, and the stored tokens become undecryptable). *Signed
out unexpectedly* is therefore a **real, designed state** — not an error to swallow.

**Always pass the preferred factor.** Omit it and Cognito returns a **factor-selection** step, costing an extra
round-trip. The web surface hit this exact thing (011).

---

## Session ownership — Amplify owns it, Ktor never touches it

Ktor's `Auth.bearer` plugin has a `refreshTokens` block, and the obvious move is to POST to Cognito from it.
**Don't.** Amplify already holds the refresh credential and refreshes on `currentSession(forceRefresh = true)`.

> **Two independent refresh mechanisms racing over one refresh token is a real and ugly bug class.**

**Therefore**: Ktor's `loadTokens` / `refreshTokens` **delegate to `AuthDriver`**, never to raw HTTP. **One owner of
the session, and it is Amplify.**

---

## Error mapping — the app must not become an enumeration oracle

Every SDK exception maps to a **closed** `AuthError`. The SDK's own text is **never** surfaced.

| SDK | `AuthError` |
|---|---|
| `NotAuthorizedException`, `UserNotFoundException` | **`InvalidCredentials`** — ⚠ **the same value, deliberately.** Distinguishing them tells an attacker whether an email is registered (FR-016). The pool sets `prevent_user_existence_errors = ENABLED`; **the client must not undo that.** |
| `CodeMismatchException` | `CodeIncorrect` |
| `ExpiredCodeException` | `CodeExpired` |
| `LimitExceeded`, `TooManyRequests`, `TooManyFailedAttempts` | `RateLimited` — **explain the wait; never retry silently** (FR-017) |
| network / offline | `Network` — recoverable, **lose nothing the customer typed** |
| anything else | `Unexpected` |

**No password, code, or token may appear in any log, message, or diagnostic** (FR-038). Ktor `LogLevel.BODY` is
**never** on in release, and `Authorization` is `sanitizeHeader`-redacted even in debug.

---

## Version floor

Passwordless (EMAIL_OTP sign-in **and** password-free sign-up) requires **Amplify Android ≥ 2.25.0** and **Amplify
Swift ≥ 2.45.0**. Below those, `signUpPasswordless` and `signInWithEmailOtp` **do not exist** — and a customer who
"registers without a password" would end up with one, which is the state the whole slice is built to prevent.
</content>
