# Contract — `AuthDriver`, the shop auth boundary (EMAIL_OTP only)

The platform auth boundary for shop-mobile. Same pattern as [013's AuthDriver](../../013-customer-mobile-foundation/contracts/auth-driver.contract.md)
— one `commonMain` interface, Amplify Android on Android, a Swift `IosAuthBridge` on iOS (Kotlin/Native cannot
call Amplify Swift) — but a **much smaller surface**, because the shop audience has exactly one credential route.

---

## The interface

```kotlin
interface AuthDriver {
    val sessionChanges: Flow<Unit>                      // SDK-initiated session drop (Keystore failure — 013 D11)

    suspend fun currentSession(forceRefresh: Boolean = false): Session?

    // The ONLY credential flow: email → code.
    suspend fun signInWithEmailOtp(email: String): AuthStep   // → NeedsOtp(destination)
    suspend fun confirmOtp(code: String): AuthStep            // → Done(session)

    suspend fun signOut()                                     // local token purge
}

data class Session(val sub: String, val accessToken: String, val idToken: String)

sealed interface AuthStep {
    data class Done(val session: Session) : AuthStep
    data class NeedsOtp(val destination: String) : AuthStep   // a code was emailed → confirm it
    data class Failed(val error: AuthError) : AuthStep
}
```

`Session` carries the **access token** (the bearer for `/shop/v1/*`, D2s) and the **ID token** (client-side, for
the display email only — never sent to the backend). No expiry field (Amplify owns refresh).

---

## ⚠ What is deliberately ABSENT (the shape of the shop audience)

The absences are the audience's rules made structural:

| Absent | Why |
|---|---|
| `signUpWithPassword` / `signUpPasswordless` / `confirmSignUp` | **No self-registration** — operators are admin-provisioned (009). The app has no path to create an account. |
| `signInWithPassword` | **No password** on this audience — EMAIL_OTP only (Principle IV, FR-008). |
| `startPasswordReset` / `confirmResetPassword` | **No password → no recovery.** |
| `updatePassword` / `globalSignOut` / `escapeHatch` | Customer-only (013); the shop backend never mutates credentials, so there is nothing to relay and no escape hatch to reach. |

There is **no password anywhere in this interface**, so — unlike 013 — there is no set-password step-up, no
escape-hatch build-guard concern about a password write. The `mobile-guard` escape-hatch/secret check is still
reused (cheap, and it keeps the raw Cognito SDK out), but its FR-024 motivation does not apply here.

---

## The flow (mirrors shop-web, native)

```
signInWithEmailOtp(email)   → Amplify signIn(username, USER_AUTH, preferredFirstFactor/challenge = EMAIL_OTP)
                              → NeedsOtp(masked destination)     [Amplify: CONFIRM_SIGN_IN_WITH_EMAIL_CODE]
confirmOtp(code)            → Amplify confirmSignIn(code)        [Amplify: DONE] → Done(session)
```

Always state the preferred first factor (EMAIL_OTP) so Cognito does not return a factor-selection step. This is
exactly the shop-web sequence (`email → startSignIn → CONFIRM_SIGN_IN_WITH_EMAIL_CODE → submitOtp → DONE`), done
against the native SDKs.

---

## Error mapping — enumeration-safe (FR-011)

`AuthError` is a closed set; the SDK's exception text is never surfaced.

| SDK condition | `AuthError` |
|---|---|
| unknown user / not authorized | **`InvalidCredentials`** — ⚠ **same value for both** — the message must never reveal whether the email is a provisioned operator (FR-011); the pool sets `prevent_user_existence_errors = ENABLED` and the client must not undo it |
| wrong code | `CodeIncorrect` |
| expired code | `CodeExpired` |
| rate-limited | `RateLimited(retryAfter?)` — explain the wait, never loop (FR-012) |
| network / offline | `Network` — degraded + retry, lose nothing entered |
| anything else | `Unexpected` |

No code or credential appears in any log, message, or diagnostic (SC-013). Ktor `LogLevel.BODY` is never on in
release; `Authorization` is `sanitizeHeader`-redacted even in debug.

---

## Session ownership — Amplify owns it; Ktor never refreshes

As in 013 (D21): Ktor's bearer plugin delegates `loadTokens`/`refreshTokens` to `AuthDriver.currentSession()` —
never a raw HTTP refresh. Two refreshers racing over one token is a bug class. One owner, and it is Amplify.

## Version floor

EMAIL_OTP passwordless sign-in requires **Amplify Android ≥ 2.25.0** and **Amplify Swift ≥ 2.45.0**.
</content>
