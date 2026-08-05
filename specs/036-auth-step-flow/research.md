# Research: Customer Sign-in & Sign-up — A Stepped Flow (036)

**Date**: 2026-08-05 · **Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Five parallel investigations fed this: two industry sweeps (stepped auth / OTP field; name-last / password
policy), and three code investigations (customer-web, customer-mobile, backend + cross-surface). Everything
below is either source-verified in this repo, cited to a vendor doc, or explicitly marked undetermined.

⚠ **Two findings changed the design.** R1 rules out URL-per-step on web. R11 turns "resend" from a
convenience into a rationed resource with a silent failure mode.

---

## R1 — Web step model: ONE route per journey, steps as client state. NOT URL-per-step.

**Decision**: `/sign-in` and `/sign-up` each stay a **single route**. Steps are client state, with
`history.pushState` + `popstate` giving the browser back button real step-back semantics. No new URLs.

**Rationale** — three independent facts, each sufficient on its own:

1. **Amplify's sign-in challenge state is per-tab and time-boxed.** It persists to `window.sessionStorage`
   (`@aws-amplify/auth@6.20.0` `client/utils/store/signInStore.ts:29-36`, keys `CognitoSignInState.username`
   / `.challengeName` / `.signInSession` / `.expiry`) with `MS_TO_EXPIRY = 3 * 60 * 1000`. Soft navigation
   is always fine; a **hard reload past 3 minutes** clears it, and a **new tab never has it**. Since
   `OTP_TTL_SECONDS = 300`, there is a two-minute window where the code is still valid server-side and the
   client has already thrown `SignInException`.
2. **`autoSignIn` state is memory-only.** `autoSignInStore` has no persistence at all, and the callback is a
   module-level export reset on load. A hard reload between sign-up and confirm makes `confirmSignUp` return
   `signUpStep: 'DONE'` instead of `COMPLETE_AUTO_SIGN_IN` — **the customer is confirmed but signed out**, and
   `completeAutoSignIn()` throws.
3. **Splitting email and password onto separate URLs is what *creates* the password-manager problem.** Today
   `SignInForm` co-mounts both in one `<form>` (`SignInForm.tsx:159-179`), which is the configuration managers
   want. URL-per-step would force the hidden-`autocomplete="username"` shim, and Chrome's *save* heuristic is
   built around observing a submission — not a client route change.

**Alternatives considered**:
- *URL-per-step* (`/sign-in/code`): rejected. Buys deep-linkability nobody asked for, at the cost of a dead
  form on reload, a broken new-tab case, and the password-manager shim. It is buildable — `signInStore`
  persistence makes it *work* — but it leans on an `@internal` Amplify module whose own TODO says "replace all
  of this implementation with state machines".
- *A `?step=` search param with `router.push`*: rejected. Whether the client component remounts on a
  searchParam-only change is a Next.js implementation detail; `history.pushState` is deterministic and keeps
  React state as the single source of truth.

**Consequences the build must carry**:
- Every step route must remain inside the `(auth)` route group so `ConfigureAmplify` has run.
- `SignInException` must be mapped to *"your sign-in timed out — ask for a new code"* and route to step 1,
  never to the current generic `"Something went wrong. Please try again."` (`auth-actions.ts:277-278`).
- A step must be **re-entrant**: arriving at the code step without live challenge state degrades to step 1,
  never to a dead form.
- Add a regression test asserting the four `CognitoSignInState.*` `sessionStorage` keys exist after `signIn()`,
  so an `aws-amplify` upgrade that drops persistence fails loudly.

---

## R2 — Mobile step model: Nav3 routes, one per step.

**Decision**: mobile keeps its existing route-per-screen shape. Three new `CustomerNavKey` entries —
`SignInPassword`, `SignUpPassword`, `ProfileName`.

**Rationale**: R1's constraints are web-only. Amplify Android and Amplify Swift hold challenge state in the
native SDK inside one process, and the app already navigates `SignIn → VerifyOtp` as separate destinations
successfully. Mobile has no tab-scoped storage and no document reload.

**Cost, recorded so nobody is surprised**: each new route needs **four** registrations — the sealed interface
(`CustomerNavKey.kt`), the `customerNavSavedState` polymorphic module (`:173`), `ALL_CUSTOMER_ROUTES` (`:208`),
and an `entry<>` in `CustomerShell.kt` — plus it must satisfy two `scripts/mobile-guard.sh` checks
(reachability, and `entry<>` coverage). `ScreenInventoryTest.kt:54` pins `ALL_CUSTOMER_ROUTES.size == 27` and
must be updated to 30.

⚠ **The pending-flow state must move into the ViewModel's UI state.** `AuthViewModel` currently keeps
`pendingEmail` / `pendingSeedPassword` / `pendingReturnTo` as plain `var`s outside `AuthUiState`
(`AuthScreens.kt:171-173`) — not saved across process death. A step form makes that a real defect: an iOS
process death on the code step would lose the address the code went to. Principle VI requires one immutable
observable state object; this slice brings them inside it.

---

## R3 — The OTP field: opt-in `cells` variant on the shared component, default unchanged.

**Decision**: `packages/design-system/src/ui/otp-input.tsx` gains `variant?: "plain" | "cells"`, defaulting to
`"plain"`. `packages/mobile-kit`'s `OtpInput` gains the same. The consoles keep today's rendering byte-for-byte
until deliberately opted in.

**Rationale**: the component is shared with `back-office` and `shop-web` through
`packages/web-kit/src/console/OtpSignInCard.tsx:148`, and mobile-kit's is shared with `shop-mobile`. Seven test
files assert on it. Two assertions are load-bearing and must keep passing:
`OtpSignInCard.test.tsx:121` (`getAllByLabelText(/one-time code/i)` → length 1) and
`apps/customer-web/e2e/otp-entry.spec.ts:50` (`page.locator("#code")` → `toHaveCount(1)`). **The cells must
therefore be drawn around ONE input, never as six inputs** — which is also GOV.UK's conclusion and the rule
already written into both files' headers.

**Rejected: local presentation in `app/(auth)/`.** customer-web has three call sites and the consoles a fourth.
Forking presentation reproduces exactly the divergence 035 was built to end (`OtpInput.kt:9-12`).

**Rejected: the `input-otp` npm package / shadcn `InputOTP`.** Confirmed absent from `pnpm-lock.yaml`. It
renders per-slot elements (breaking the two assertions above), and `otp-input.tsx:18-21` already argues the
bundle case. `/search` sits **2.0 KB** from the 174 KB gate.

### R3a — Web technique

GOV.UK ships **letter-spacing only**, not cells — verbatim from `govuk-frontend` `input/_mixin.scss`:

```scss
.govuk-input--extra-letter-spacing {
  @include base.govuk-font-tabular-numbers;
  letter-spacing: 0.05em;
}
```

The repo **already has the equivalent** (`otp-input.tsx:52`: `font-mono tracking-[0.35em]`). Visible cells are
one step beyond GOV.UK, achieved with a `repeating-linear-gradient` grid behind a monospace `1ch` run.
Constraints, all verified:

| Concern | Verdict |
|---|---|
| Monospace required | ✅ `--font-mono` is **not** overridden in `tokens.css`, so Tailwind's monospace default applies and `1ch` is reliable. Add `font-variant-numeric: tabular-nums` as belt-and-braces. |
| Trailing letter-space off-by-one | **Real.** `letter-spacing` adds space after the last glyph too, so the grid overhangs by one gap. Fixed by `padding-left: calc((gap - border)/2)` + `clip-path: inset(0 calc(gap/2) 0 0)`. ⚠ Both are **overridden by the consumers' `px-3`** — the variant must own its padding. |
| `attr(maxlength type(<integer>))` | ⚠ **Chrome-only.** Hardcode `--otp-cells: 6` from the shared constant. |
| RTL | ⚠ **Breaks** — `padding-left`, `clip-path` and `90deg` are physical. Set `dir="ltr"` on the field; a numeric code is LTR content regardless. |
| Zoom / text scaling | ✅ everything in `ch`/`em`, scales uniformly. |
| Accessibility | ✅ **unchanged** — CSS does not touch the a11y tree. Still one node, one value, paste/undo/`Ctrl+A`/autofill intact. |

⚠ **`rounded-full` clips the first and last cell borders.** The pill radius the three customer-web call sites
pass (`SignInForm.tsx:308` et al) is incompatible with a cell grid; the `cells` variant sets its own radius.

### R3b — Android technique

One `BasicTextField`, cells drawn in `decorationBox` from the current value.

⚠ **The idiom does not call `innerTextField()`** — calling it would paint the real text over the cells. Cost:
**no caret and no selection handles** (recipes fake the caret with an animated bar on cell `value.length`).
Semantics are unaffected — `Modifier.semantics { contentDescription = "One-time code" }` sits on the field's
own modifier (`OtpInput.android.kt:54-57`), outside the decoration.

⚠ **Over-length must stay visible.** Six cells can only show six characters, so an 8-digit paste would render
as `123456` — *visually reproducing the exact defect 035 exists to fix*
(`OtpInput.kt:35-47`, and `OtpInputTest.kt:40-41` pins `normalizeOtp("12345678") == "12345678"`). The renderer
**must** branch on `value.length > OTP_LENGTH` and fall back to plain flowing text in the error colour.

### R3c — iOS: a BLOCKING spike, with a recorded fallback

The iOS actual is a native `UITextField` in a `UIKitView` (`OtpInput.ios.kt:86-121`) — and that is deliberate:
`textContentType = UITextContentTypeOneTimeCode` (`:92`) is the one-tap autofill from Mail, and
`OtpInput.ios.kt:34-38` records that a Compose field cannot request it.

Proposed approach: draw the cells in Compose *behind* a colour-cleared (`textColor`/`tintColor = clear`) but
still visible, still-first-responder `UITextField`. **Three things could break it and none is documented:**

1. Does a colour-cleared field still get the QuickType one-time-code suggestion? (Clear colours ≠ `hidden`,
   and `alpha = 0` is known to suppress it — but I found no authoritative statement for the clear-colour case.)
2. CMP 1.11.1 z-order and hit-testing for Compose content composited with `UIKitView`.
3. `UIKitInteropProperties(isNativeAccessibilityEnabled = true)` (`:120`) means UIKit owns accessibility for
   that subtree — Compose cells must be `clearAndSetSemantics {}` or a second a11y node appears.

**Decision**: **spike first (T00x, blocking).** If it fails, **iOS keeps the spaced single field** — which is
GOV.UK's actually-shipped design — and the split is recorded as justified. **Autofill wins over cells.** It is
the single highest-value behaviour in this component and the only part of this feature that can silently
destroy it.

⚠ **Coverage gap found**: `AuthFoundationUiTest.kt:74-77` stubs `OtpInput` out via `otpInputOverride`, so the
"exactly one node" invariant has **never been asserted against the real component** on either mobile app, and
`customer-mobile` has no OTP test at all. This slice adds the missing test.

---

## R4 — Resend: three different mechanisms behind one button.

**Decision**: one resend affordance in the UI, three implementations behind it, and the sign-in one is
**honestly named** as re-starting sign-in.

| Flow | Mechanism | Evidence |
|---|---|---|
| **Sign-in (custom challenge)** | ⚠ **No resend API exists.** A fresh `signIn()` is the only way. | `create-auth-challenge.ts:57-66` — a re-challenge *reuses* the envelope and sends **no email**. A new email requires `envelopeFromSession(session) === null`, i.e. a brand-new `InitiateAuth`. Neither `aws-amplify/auth`, Amplify Android (`Auth.kt:73-386`) nor Amplify Swift exposes a sign-in resend. |
| **Sign-up confirmation** | `resendSignUpCode({ username })` | Exported at `providers/cognito/index.ts:8`. ⚠ **Called nowhere in this repo** — no surface can resend a sign-up code today. |
| **Password reset** | Re-call `resetPassword({ username })` | Cognito `ForgotPassword` sends a new code on every call. |

**Consequences of the sign-in mechanism, all of which the UI must own**:
- A resend **resets the 3-attempt counter** (the new session starts at `[]`).
- The old code is only *discarded client-side* — `signIn()` overwrites the store. ⚠ It is **not invalidated
  server-side**; a holder of the old `Session` string can still redeem it for its remaining TTL. The spec's
  "supersession" is a client-side property, and that is now written down.
- It **burns one of five hourly sends** — see R11.

**Mobile `AuthDriver` additions** (the interface is the seam; `AuthDriver.kt:24-69`):
- `resendSignUpCode(email): AuthStep` — genuinely new; needs Android + `SwiftAuthBridge.swift` actuals.
- `resendSignInCode(email): AuthStep` — ⚠ **named honestly**; it re-calls `signInWithEmailOtp`. `shop-mobile`
  already models this correctly (`AuthViewModel.kt:132-146`) and `customer-mobile` has **zero** `resend`
  references anywhere.
- Password-reset resend needs nothing new — `startPasswordReset` is already on the interface.

---

## R5 — Name-last: wire `updateName`, keep the header on the claim, read before you write.

**Decision — option (c)**, the combination:
1. Wire `updateName()` into `customer-me-v1-patch.ts`, **DB first, Cognito second, best-effort + logged**.
2. Keep the web header reading the ID-token claim, and keep the existing forced token refresh — which
   currently is a **no-op** and becomes real.
3. The name step **reads the record first** (`GET /customer/v1/me`, idempotent create) and only then PATCHes,
   through the **existing** `updateProfile` action / use case. **No new endpoint.**

**The problem being solved**: the name is read from the claim in exactly **two lines**
(`UserIsland.tsx:61,75`); everything else — the whole account page, all of mobile, every backend — reads the
platform record. And:

```
$ grep -rn 'updateName' --include='*.ts' --include='*.tsx' . | grep -v node_modules
apis/edge-api/customer/src/password/cognito.ts:167:export async function updateName(
```

**One occurrence repo-wide: its own definition.** So `actions.ts:41-50`'s claim — *"The backend writes the
record AND the Cognito attributes"* — is **false**, and the header greeting shows the old first name
**permanently**, not "for up to an hour". This is a live shipped bug independent of this feature, and it is
precisely what would make FR-035 fail.

**Enabling facts, all verified**:
- ✅ `given_name`/`family_name` are **not required** at `SignUp` — there is no `schema {}` block in
  `infra/modules/cognito-user-pool/*.tf`, so Cognito's default optional schema applies. Dropping them from the
  `SignUp` call needs **no Terraform change**.
- ✅ Both are in `customer_writable_attributes` for **both** app clients (`auth-customer.tf:20-24`, `:111`, `:206`).
- ✅ `UpdateUserAttributes` is **token-authorized** — `password/cognito.ts:14-24`: *"THIS MODULE NEEDS NO IAM
  PERMISSIONS AT ALL."* Both clients already relay the access token.
- ✅ `require_verification_before_update = ["email"]` (`auth-customer.tf:117`) — **email only**; names apply
  immediately.
- ✅ The JIT upsert already never overwrites the name on conflict (`repo.ts:88-93`), guarded by
  `repo.guard.test.ts:63-74`. **It needs no change** and a NULL-name insert is exactly what this flow wants.
- ✅ `forceRefresh` is a real Cognito round trip (`refreshAuthTokens.mjs` → `getTokensFromRefreshToken`), so the
  new token carries the just-written attribute.
- ✅ Nothing else breaks on a nameless customer: `page.tsx:127` renders *"Add your name below"*,
  `UserIsland.tsx:61` falls back to `"Account"`, `AccountScreens.kt:272` to `"Your account"`.

**⚠ Three hazards this decision exists to avoid**:

1. **PATCH before the record exists returns the BARRED message.** `customer-me-v1-patch.ts:126-135` maps
   `CustomerNotFoundError` → `403 "this account cannot be used"` — the exact string a *barred* customer sees.
   A ninety-second-old account would be told its account is unusable. **Hence: read first.**
2. **The record is not reliably seeded on web.** `seed-actions.ts:37-50` has **two silent exits** (`if
   (!session) return` and `catch { }`). Mobile is safe — `SessionState.Authenticated` is only reachable
   through a successful `GET /me` (`SessionManager.kt:97-102`).
3. ⚠ **The Google callback never seeds the record at all.** `CallbackHandler.tsx:49-66` merges cart and saved
   items but never calls `seedCredentialRoute`. Latent today (Google is parked) and a **guaranteed 403** the
   day it un-parks. Fixed here.

**Rejected — option (b), read the record instead of the claim**: the header renders on *every* storefront page
and today costs **zero network**. Making it record-backed puts a Lambda + Sydney RDS round trip on every public
page view; 029 measured that round trip at **135 ms** and rewrote a whole endpoint because of it. It also
fights the `no-amplify-on-guest-path` depcruise rule, which lists `components/header/` with `reachable: true`.
Correct in principle, wrong in practice, for two lines.

**Rejected — option (d), client-side `updateUserAttributes` from the name step**: legal on web (`app/(auth)/`
is inside the Amplify quarantine's allowed set) but produces **two uncoordinated writes** from the client and
needs a new `AuthDriver` method plus both mobile actuals. Note this is also *why* the backend `updateName`
exists: `@aws-amplify/auth/server` exports only `fetchUserAttributes` and `getCurrentUser`.

⚠ **Do NOT pass `phone` to Cognito.** Writing `phone_number` would violate 034 FR-060a, and
`customer/phone-isolation.test.ts` scans for exactly this.

---

## R6 — `autoSignIn` after sign-up: UNDETERMINED. Blocking spike, plus an Android defect found on the way.

**Status**: this is 035's still-open **T003** and it directly gates the sign-up design — if confirming sign-up
costs a **second** code, the "code → name" sequence becomes "code → code → name".

**What is source-verified**:
- **Password route** (`autoSignIn: true`): `handleAutoSignInWithCodeOrUserConfirmed` branches on
  `options?.authFlowType === 'USER_AUTH'` (`utils/signUpHelpers.ts:118-120`) → false → `signInWithSRP`.
  **`USER_SRP_AUTH`. Custom triggers never invoked. No second code. Unambiguous.**
- **OTP route** (`autoSignIn: { authFlowType: "USER_AUTH" }`): → `signInWithUserAuth`, which forwards the
  `ConfirmSignUp` session (`apis/signInWithUserAuth.ts:83-89`) as `InitiateAuth { AuthFlow: 'USER_AUTH',
  Session }` with no `PREFERRED_CHALLENGE`. AWS documents this as the no-second-code path: *"The `Session`
  parameter provides proof of authentication and Amazon Cognito ignores the `AuthParameters` when you pass a
  valid session code."* Eligibility holds — `allowed_first_auth_factors = ["EMAIL_OTP"]` (`auth-customer.tf:34`).

**What is undetermined**: AWS documents nowhere what `USER_AUTH` does when `DefineAuthChallenge` is attached to
the pool — whether the trigger fires, whether `CUSTOM_CHALLENGE` can appear in `AvailableChallenges`, or
whether a valid `Session` bypasses it. [amplify-js#14138](https://github.com/aws-amplify/amplify-js/issues/14138)
reports a second OTP, but on Gen-1 CLI with a `CUSTOM_AUTH`-configured pool taking the plain `signIn()` path
with no session forwarded — **not evidence against this design**, and no maintainer ever answered it.

If a second code *did* occur it would be **6 digits** (our `CreateAuthChallenge` would issue it), not 8 —
8 only if Cognito returned the managed `EMAIL_OTP` factor, reachable in principle because the customer client
retains `ALLOW_USER_AUTH` (the recorded consistency gap).

⚠ **Defect found, fixed here regardless of the spike**: `AmplifyAuthDriver.kt:186-189` —
```kotlin
val result = Amplify.Auth.autoSignIn()
return if (result.isSignedIn) sessionOrFail() else AuthStep.Failed(AuthError.Unexpected)
```
A `CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE` becomes a hard `Unexpected` — confirmed, not signed in, generic
error. **iOS handles it correctly** (`SwiftAuthBridge.swift:110-114` runs `mapSignIn`). Android must route
through `mapSignIn` too. This asymmetry is live today and is exactly the "Android has never been looked at"
carry-forward, now four slices old.

---

## R7 — Google: the mark is an asset in `design-system`, never in `brand`, and never recoloured.

**Decision**: authored `google-g.svg` lives in `packages/design-system`. Web consumes it as an **inlined** SVG
component used only inside `(auth)`. Mobile gets a **hand-authored** VectorDrawable in
`packages/design-system/mobile-assets/drawable/ic_google_g.xml`, riding the existing sync + drift guard.

**Rationale**:
- Google's [branding guidelines](https://developers.google.com/identity/branding-guidelines) are explicit:
  *"you can't change the size or color of the Google 'G' logo. It must be the standard color version… and
  appear on a white background."* Monochrome 'G' is prohibited; the **button** may be Light/Neutral/Dark, the
  **mark** never changes. The icon may not appear without accompanying text.
- ✅ **The constitution's carve-out covers exactly this** — *"a third-party sign-in mark whose provider's brand
  guidelines require its own colours; that is an asset, not a token."* No token is added; `tokens:check` must
  pass **unchanged**.
- ⚠ **`packages/brand` is the wrong home.** Its entire purpose is recolouring a mark through `colourways.mjs` —
  the one operation Google forbids. Putting it there invites the prohibited edit.
- ✅ `packages/design-system/mobile-assets/` is already the SSOT for "an authored vector both mobile apps render
  from `commonMain`", already has a three-mode drift guard that names the stale surface, and **already ships
  third-party-licensed art with its licence alongside** (`MATERIAL_SYMBOLS_LICENSE.txt`) — the direct precedent.
- Existing wording **"Continue with Google"** is compliant and stays.

**Verified non-issues**: Google's `#4285F4 #EA4335 #FBBC05 #34A853` are not on the banned lists in
`check-no-emerald.sh` / `check-no-jade.sh`. ⚠ `#3b82f6` **is** banned and is visually close to Google blue but
a different value — recorded here so nobody "fixes" it later.

**Gaps closed**: neither customer-web screen renders any mark today (text-only button), and
**customer-mobile has no Google button at all** — `AuthScreens.kt:351-353` replaced the source design's
Google+Facebook row with the OTP button.

**Bundle**: inline SVG inside `(auth)` costs the nine measured guest routes nothing. ⚠ **Do not export the mark
through the `@effy/design-system/ui` barrel** — guest routes import from that barrel, and `/search` has 2.0 KB
of headroom.

---

## R8 — Confirm-password comes OUT of web sign-up, and the password hint is a lie in three places.

**Decision**: remove the confirm field; add a reveal toggle; state the real rule.

`SignUpForm.tsx:24` declares `const MIN_PASSWORD = 8` and renders *"At least 8 characters, with upper and lower
case letters and a number."* The **real policy is 12 characters with no composition rules**
(`packages/shared-types/src/customer.ts:152`). So sign-up states a rule that is both **too short and falsely
restrictive** — and this is the very drift `authErrorMessage`'s own comment says was fixed elsewhere:
*"The old text became a LIE the moment the policy changed."*

Three sites understate the policy and are corrected together: `SignUpForm.tsx:24`,
`ResetPasswordForm.tsx:90` (`minLength={8}`), and `lib/amplify-config.ts` (`passwordFormat.minLength: 8`).

NIST SP 800-63B-4 (2025) is worth recording: **15** characters for single-factor passwords, `SHALL NOT`
impose composition rules, `SHALL NOT` require periodic rotation, `SHOULD` offer a display-password option.
⚠ **The platform's 12 is below NIST's current 15.** That is 012's recorded, justified deviation (valid only
while breach screening and rate limiting hold) — **not re-litigated here**, but it should not be forgotten.

Web's account page already has the right shape (`PasswordField.tsx:17-20`, quoting GOV.UK's *"a second field is
not helpful for users"*), and mobile sign-up already has no confirm field. This aligns web with both.

---

## R9 — `classifySignInStep` exists, is correct, and is called by nothing.

`auth-actions.ts:151-165` exports `classifySignInStep`. **Zero call sites.** `SignInForm.tsx:106-110` discards
`submitOtpCode`'s result and calls `done("otp")` unconditionally, and `:154-155` ignores `signInWithOtp`'s step.

Consequence: a **wrong code on attempt 1 or 2 raises no exception** (the platform re-issues the challenge —
`policy.ts:104-131`), so the storefront treats it as success and navigates a **still-signed-out shopper** away
with nothing on screen. `packages/web-kit/src/auth/otp.ts:49-54` guards this correctly, so the two consoles
already behave better than the storefront. Mobile is safe via `mapSignIn`.

**Decision**: wire it. This is FR-012 / SC-003 and it is a repair, not a feature.

---

## R10 — Refusals: what the platform can honestly say.

Verified constants — `apis/edge-api/auth/src/otp/policy.ts:25-28`:
`OTP_LENGTH = 6` · `OTP_TTL_SECONDS = 300` · `OTP_MAX_ATTEMPTS = 3` · `OTP_SENDS_PER_HOUR = 5`.

| Real cause | What the client can observe |
|---|---|
| Wrong code, attempts 1–2 | **No error.** `confirmSignIn` resolves with the same challenge step again. |
| **Expired** code, attempts 1–2 | **Identical** — `verifyAnswer`'s `reason` never leaves the Lambda. |
| Malformed / 8-digit code | **Identical.** |
| 3rd refusal | `NotAuthorizedException` |
| **Rate-limited** (>5/hr) | ⚠ **Looks like a successful send**, then `NotAuthorizedException` after three guesses. |
| SES failure / missing HMAC key / unknown pool | **Identical to rate-limited.** |
| Unknown email address | **Identical to a real account** — by design (FR-016/FR-028). |
| WAF block (100 req / 5 min / IP) | `ForbiddenException` — ⚠ **unhandled on every surface**, falls to the generic default. |

**Decision**: the UI says exactly three things on the sign-in code route — *not accepted, try again* (attempts
1–2, from the step); *that attempt is over, here's a fresh code* (`NotAuthorizedException`); and *we can't send
another right now* (client-counted, R11). Nothing else is honest.

⚠ **035's FR-027 is unmeetable as built** and this is now recorded rather than restated: it demands
distinguishable refusals, FR-028 forbids the disclosure that would enable them, and FR-028 won. Spec 036's
FR-011 is written to the reality. Where the platform genuinely *can* distinguish — sign-up confirmation and
password reset, which use Cognito's managed flows and emit real `CodeMismatchException` /
`ExpiredCodeException` — the message says which.

⚠ `ForbiddenException` gains a message on both surfaces here. It costs one branch and is currently a generic
"something went wrong" for a user who is merely being rate-limited by IP.

---

## R11 — ⚠ Resend is rationed: 1 + 4 per clock hour, and the sixth fails silently.

`issuance.ts:115-118` with `OTP_SENDS_PER_HOUR = 5` and a **fixed** hourly bucket
(`windowStart = floor(now/3600)*3600`, `:49-51`), keyed `userPoolId#HMAC(email)`.

**A shopper gets one initial code plus four resends per clock hour.** The sixth `signIn()` sends nothing —
and `create-auth-challenge.ts:97-105` still returns a `maskedDestination`, so Amplify reports a normal
challenge, the app says *"we emailed a code to a•••@…"*, **and no email exists**. Whatever they type then
fails three times and produces *"That didn't work. Request a new code and try again."* — advice that cannot work.

⚠ **A step form with a prominent resend button will hit this far more often than today's UI, which has no
resend at all.** The client-side cooldown is therefore **load-bearing, not courtesy**.

**Decision**:
- 30-second cooldown with a visible countdown. `apps/customer-web/lib/otp-cooldown.ts` already implements this
  (`COOLDOWN_SECONDS = 30`, `sessionStorage`), is unit-tested, and **has zero call sites** — wire it. Mobile
  copies `shop-mobile`'s `resendRemainingSeconds` model (`AuthViewModel.kt:132-146`); `customer-mobile` has no
  `resend` reference anywhere.
- **Count sends client-side within the flow.** After the fifth, the control refuses locally with an honest
  message rather than firing a request that silently does nothing (FR-009).
- ⚠ **Record the limit of that honesty**: the counter is per-flow, so a shopper who already spent the budget in
  another tab or on another device will still be shown a normal code screen. The platform cannot tell us, and
  the UI must not pretend otherwise.
- The bucket boundary is arbitrary — at 10:59 five more arrive at 11:00; at 10:01 the wait is 59 minutes.
  `retryAfterSeconds` **is computed and then discarded** by the trigger, deliberately, so the UI cannot state a
  wait time.
- Sign-up confirmation and password reset do **not** touch this counter; they are bounded by Cognito's own
  per-user limits.

---

## R12 — No card is introduced, so Principle V needs no justification here.

The no-card rule bites on *content tiled into bordered boxes*. Neither surface does that:
`app/(auth)/layout.tsx` is a centred `max-w-sm` main with no card container, and mobile's `AuthScaffold`
(`AuthScreens.kt:270-310`) is a plain vertical stack. ⚠ The console component is *named* `OtpSignInCard`, but
it is out of scope (FR-044a) and is not being restyled. **This slice adds no card**, and the plan records that
rather than claiming an exception it does not need.

---

## R13 — Telemetry: specified, and honestly unmeasurable today.

Principle VII requires a plan that adds a user-facing flow to state its events. Events are specified in
[contracts/telemetry.md](contracts/telemetry.md).

⚠ **PostHog has never been initialised on `customer-web`** — every `capture()` on the storefront, including the
existing `sign_in_completed` and `sign_up_completed`, is a **no-op today**. Mobile telemetry has been deferred
for twelve consecutive slices.

**Decision**: this slice **emits** the events through the existing `capture()` seam and **does not** take on
platform-wide analytics initialisation — that is its own slice, and folding it in here would make an
already-wide UI change wider. The consequence is written into the spec's Assumptions and into
[quickstart.md](quickstart.md): **SC-006 and SC-007 must be measured by observed sessions, not by dashboards.**

---

## R14 — Scope boundaries confirmed.

- **No database migration.** Nothing in this feature adds or alters a column. `public.customer.given_name` /
  `family_name` already exist and are already nullable, with the reason recorded in
  `20260715090000_customer_name_parts.sql:21-31`.
- **No Terraform change.** Name attributes are optional at `SignUp` and already writable by both clients;
  Google stays parked, so no identity provider, hosted domain or `pre_sign_up` ARN is set here.
- **Cold path only** (Principle III). The single backend edit is `apis/edge-api/customer` — an operator/profile
  concern, exactly where 011's routing law puts it. **No `core-api` change, no new endpoint.**
- **`packages/web-kit` is untouched** — `customer-web` does not depend on it (`package.json:19-37`), and its
  only consumers are the two out-of-scope consoles.
