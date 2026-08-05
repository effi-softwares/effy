# Contract: The Mobile `AuthDriver` Diff + the One Backend Edit (036)

**Date**: 2026-08-05 · **Plan**: [../plan.md](../plan.md) · **Research**: [../research.md](../research.md)

---

## 1. `AuthDriver` — the seam every mobile auth flow must fit through

`apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/auth/AuthDriver.kt`

The interface is deliberately narrow — no `updatePassword`, no `globalSignOut`, no `confirmResetPassword`, no
escape hatch — because Cognito's `ChangePassword` permits omitting the previous password when the user has
none, which is an account-takeover primitive. `scripts/mobile-guard.sh` enforces the absence. **Anything new
must either fit here or go to the backend.**

### Removals

```kotlin
- suspend fun signUpWithPassword(email: String, password: String, given: String, family: String): AuthStep
+ suspend fun signUpWithPassword(email: String, password: String): AuthStep

- suspend fun signUpPasswordless(email: String, given: String, family: String): AuthStep
+ suspend fun signUpPasswordless(email: String): AuthStep
```

✅ Safe: `given_name`/`family_name` are **optional** Cognito attributes (no `schema {}` block in the module), so
dropping them from `SignUp` needs no Terraform change and cannot break registration.

⚠ Breaks **compilation** in four places — `AmplifyAuthDriver.kt:179-181`, `SwiftAuthBridge.swift:176-178`,
`AuthUseCases.kt:17,23`, `AuthScreens.kt:110-121,380-381,400-406` — and breaks **no test**, because no Kotlin
test exercises sign-up with names. ⚠ That absence is itself the 029/033 "no test covered it" pattern; a test
lands with this change.

### Additions

```kotlin
/** Ask Cognito to email the sign-UP confirmation code again. Managed flow — refusals ARE distinguishable. */
suspend fun resendSignUpCode(email: String): AuthStep

/**
 * ⚠ NAMED HONESTLY: this is NOT a resend. There is no resend API for a custom challenge.
 * It re-runs signIn() from scratch, which means:
 *   • a NEW Cognito session — the previous code becomes unreachable from this device
 *   • the 3-attempt counter RESETS to zero
 *   • ONE of the five hourly sends for this address is consumed
 * See research R4 / R11.
 */
suspend fun resendSignInCode(email: String): AuthStep
```

**Not added**: a password-reset resend — `startPasswordReset` is already on the interface and re-calling it *is*
the resend.

**Not added**: any federated method. Google stays parked; the button shows FR-039's message and calls nothing.

### Actuals

| Method | Android (`AmplifyAuthDriver.kt`) | iOS (`SwiftAuthBridge.swift` ← `IosAuthDriver.kt`) |
|---|---|---|
| `resendSignUpCode` | `Amplify.Auth.resendSignUpCode(email)` — `Auth.kt:108-111` | `Amplify.Auth.resendSignUpCode(for:options:)` |
| `resendSignInCode` | delegate to `signInWithEmailOtp(email)` | same |

⚠ **`shop-mobile` already models this correctly** — `AuthViewModel.kt:132-146` has `AuthStage`,
`AuthSubmission.ResendingCode`, `resendRemainingSeconds`, `canResend` and `maskedDestination`.
`customer-mobile` has **zero** `resend` references anywhere. Copy shop-mobile's shape rather than inventing one.

---

## 2. ⚠ Android defect fixed here regardless of this feature (R6)

`apps/customer-mobile/shared/src/androidMain/.../AmplifyAuthDriver.kt:186-189`:

```kotlin
private suspend fun autoSignIn(): AuthStep {
    val result = Amplify.Auth.autoSignIn()
    return if (result.isSignedIn) sessionOrFail() else AuthStep.Failed(AuthError.Unexpected)   // ⚠
}
```

A `CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE` becomes a hard `Unexpected` — the shopper is **confirmed but not
signed in**, and shown a generic error with no route forward. **iOS handles it correctly**
(`SwiftAuthBridge.swift:110-114` runs `mapSignIn`). Android must route through `mapSignIn` too.

⚠ This asymmetry is live today and is exactly the *"Android has never been looked at"* carry-forward, now four
slices old. It also becomes load-bearing if **SPIKE-2** finds a second code.

---

## 3. `AuthUiState` — state moves in from loose `var`s (Principle VI)

Today (`AuthScreens.kt:75-79, 171-173`):

```kotlin
data class AuthUiState(val loading: Boolean, val error: String?, val info: String?)
private var pendingEmail: String = ""            // ⚠ outside the state
private var pendingSeedPassword: Boolean = false // ⚠ not saved across process death
private var pendingReturnTo: CustomerNavKey? = null
```

Target: one immutable observable object carrying `step`, `email`, `maskedDestination`, `attemptsUsed`,
`sendsThisFlow`, `resendRemainingSeconds`, `returnTo`, `seedPassword`, plus `loading`/`error`/`info`. See
[../data-model.md](../data-model.md) §2.

⚠ **This is the FR-022 fix as well as the Principle VI fix**: an iOS process death on the code step currently
loses the address the code went to, so the screen cannot even say where to look.

---

## 4. New Nav3 routes — and the four registrations each

`CustomerNavKey.SignInPassword(email)` · `CustomerNavKey.SignUpPassword(email)` · `CustomerNavKey.ProfileName`

Each needs **all four** or the build fails / the app crashes at runtime:

1. the `@Serializable` entry in the sealed interface (`CustomerNavKey.kt`)
2. the `customerNavSavedState` polymorphic module (`:173`) — ⚠ omitting this breaks **iOS process-death
   restore only**, which `ScreenInventoryTest.kt:73` exists to catch
3. `ALL_CUSTOMER_ROUTES` (`:208`)
4. an `entry<>` block in `CustomerShell.kt` — ⚠ `mobile-guard.sh` check 8 exists because 034 shipped a route
   with every other gate green and crashed

⚠ `ScreenInventoryTest.kt:54` pins `ALL_CUSTOMER_ROUTES.size == 27` → **30**.

⚠ `CustomerNavKey.VerifyOtp` already carries `OtpPurpose.RECOVERY`, whose `submitOtp` branch is an empty `{}`
(`AuthScreens.kt:140`) — a declared, serialised, round-trip-tested **dead branch**. Either wire it or delete it;
do not leave it.

---

## 5. The one backend edit — `updateName` gets a caller

`apis/edge-api/customer/src/functions/customer-me-v1-patch.ts`

```ts
// after the record write succeeds:
await updateCustomerProfile(sub, dto)          // ← existing, unchanged, authoritative
try {
  await updateName(accessToken, dto.givenName, dto.familyName)   // ⚠ best-effort, logged
} catch (err) { log.warn("cognito name sync failed", { sub, err }) }
```

**Rules, all load-bearing:**

| Rule | Why |
|---|---|
| ⚠ **DB first, Cognito second** | Never fail the request after the record is committed, or the customer is told their save failed when it succeeded. Precedent: `notify.ts:38-46`. |
| ⚠ **Best-effort, never fatal** | A Cognito blip must not block a profile save. |
| ⚠ **The access token stays OPTIONAL** | Both clients send it today (`X-Effy-Access-Token`), but `requireCaller`'s hard throw would break any in-flight mobile build. Skip the sync if absent; log it. |
| ⚠ **NEVER pass `phone`** | Writing `phone_number` violates 034 FR-060a; `customer/phone-isolation.test.ts` scans for exactly this. |
| **No IAM, no env var** | `UpdateUserAttributes` is authorised by the **customer's own access token** — `password/cognito.ts:14-24`: *"THIS MODULE NEEDS NO IAM PERMISSIONS AT ALL."* |
| **Add a test** | The current absence of a caller had **no test**. One lands here. |

⚠ **This is a bug fix independent of name-last.** `actions.ts:41-50` currently claims *"The backend writes the
record AND the Cognito attributes"* — it does not, so the web header greeting shows the old first name
**permanently**, and the forced token refresh beside it is a no-op that costs a round trip.

---

## 6. Web: `seed-actions.ts` and `CallbackHandler.tsx`

```ts
// seed-actions.ts:37-50 — TWO silent exits, both of which strand the name step
if (!session) return          // ⚠ silent
catch { /* Non-fatal. */ }    // ⚠ silent
```

⚠ If either fires, the record does not exist when the name step PATCHes → `403 "this account cannot be used"`,
the **barred customer** message, ninety seconds into a brand-new account.

Fixes: surface the failure to the caller, and have the name step **read before it writes** regardless
(`requireCustomer()` / `GET /me` is an idempotent create). Belt and braces — the read alone removes the class.

⚠ **`CallbackHandler.tsx:49-66` never seeds at all.** It merges cart and saved items and nothing else, so a
Google sign-up would 403 at the name step. Latent today (Google is parked); fixed now, because the day it
un-parks is not the day to discover it.
