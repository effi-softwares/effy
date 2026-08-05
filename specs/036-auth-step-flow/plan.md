# Implementation Plan: Customer Sign-in & Sign-up — A Stepped Flow

**Branch**: `036-auth-step-flow` | **Date**: 2026-08-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/036-auth-step-flow/spec.md`

---

## Summary

Turn the customer sign-in and sign-up journeys into a **step form** on both customer surfaces: the emailed code
is the default route, Google sits beside it, password is a deliberate second step, and the person's name is
asked **last — after the account exists**. The code screen gains what it has always lacked: the address the
code went to, a resend, a countdown, an honest refusal, and a submit action at the bottom.

**The technical approach in one paragraph.** Web keeps **one route per journey** with steps as client state
(R1 — Amplify's challenge state is per-tab and 3-minute-boxed on reload, and URL-per-step is what *breaks*
password managers); `history.pushState`/`popstate` gives the back button real step semantics. Mobile adds
**three Nav3 routes** and moves the pending-flow state into the ViewModel's immutable UI state, where
Principle VI says it belongs. The shared code field gains an **opt-in `cells` variant** so the two out-of-scope
consoles stay byte-identical. Name-last needs **one backend edit** — wiring the already-written, never-called
`updateName()` into the profile PATCH — plus a name step that **reads the record before it writes**, because
PATCHing a record that does not yet exist returns the *barred customer* message. **No migration, no Terraform,
no new endpoint, no `core-api` change.**

**Three repairs ride along because a slice that rewrites these screens cannot leave them standing**: the
storefront treats a not-yet-accepted code as a successful sign-in (R9); Android dead-ends on an `autoSignIn`
challenge where iOS handles it (R6); and `updateName()` has never been called, so the header greeting is stale
forever (R5).

---

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22 (web + cold path); Kotlin 2.4.0 / Compose Multiplatform 1.11.1
(mobile). No Go change — `core-api` is untouched.

**Primary Dependencies**: Next.js 16.2.6 (App Router, Cache Components) + React 19 + Tailwind v4 + shadcn
primitives from `@effy/design-system/ui`; `aws-amplify` 6.18.0 → `@aws-amplify/auth` 6.20.0 (web); Amplify
Android 2.25.0 + Amplify Swift (mobile); Jetpack Navigation 3. **Zero new npm or Gradle dependencies** — in
particular **not** `input-otp` (R3).

**Storage**: None added. No migration. `public.customer.given_name` / `family_name` already exist and are
already nullable, deliberately (`20260715090000_customer_name_parts.sql:21-31`).

**Testing**: Vitest (web + cold path), Playwright (`apps/customer-web/e2e/`), Kotlin `commonTest` on Android
host **and** `iosSimulatorArm64` (033 found the iOS test compilation had never run — it runs here).

**Target Platform**: `apps/customer-web` (public storefront, SSR/PPR) and `apps/customer-mobile` (iOS +
Android). Internal consoles explicitly out of scope (FR-044a).

**Project Type**: Multi-surface monorepo — two client surfaces, one shared design-system package, one shared
mobile-kit package, one cold-path service edit.

**Performance Goals**: The nine measured guest routes stay **byte-identical** (`/search` has **2.0 KB** of
headroom against the 174 KB gate). Auth routes are not in the budget list and remain so. The countdown must not
cause a re-render storm — one tick per second, state local to the resend control.

**Constraints**: `OTP_LENGTH = 6` · `OTP_TTL_SECONDS = 300` · `OTP_MAX_ATTEMPTS = 3` ·
`OTP_SENDS_PER_HOUR = 5` (fixed hourly bucket) — all `apis/edge-api/auth/src/otp/policy.ts:25-28`, none changed
here. Amplify's `signInStore` expires at **3 minutes** on a hard reload, which is *stricter* than the 5-minute
code TTL. Touch targets ≥ 48 dp/px.

**Scale/Scope**: 2 surfaces × 2 journeys × ~5 steps. ~14 screens/states, 1 shared component variant ×3
renderers, 3 new mobile routes, 2 new `AuthDriver` methods, 1 cold-path handler edit, 1 new asset.

**NEEDS CLARIFICATION**: none remaining. Two **blocking spikes** are scheduled instead (§Spikes) — they resolve
facts AWS and JetBrains do not document, and no amount of further reading will settle them.

---

## Constitution Check

*Constitution v1.11.1. GATE: passed before Phase 0 research, re-checked after Phase 1 design — see §Post-Design.*

| Principle | Verdict | Evidence |
|---|---|---|
| **I. Spec-Driven** | ✅ PASS | spec → plan → tasks. Findings that touch *earlier* features are recorded in their own artifacts, not patched in code: 035's FR-027 is recorded as unmeetable (R10), 012's FR-023 is *upheld* (R8), 011's FR-009a is superseded by FR-032. |
| **II. Shared Contracts** | ✅ PASS | The code field stays **one** shared component per platform, gaining a variant rather than a fork (R3). `OTP_LENGTH` remains the single definition (FR-045). ⚠ The three duplicated `CodeField` wrappers in `app/(auth)/` are consolidated. |
| **III. Dual-Path** | ✅ PASS | Cold path only — `apis/edge-api/customer`. Profile/account is exactly where 011's routing law puts it. No `core-api` change, no new endpoint. |
| **IV. Auth Isolation** | ✅ PASS | No pool, client, flow or credential changes. Customer audience only. No cross-pool anything. Google stays **parked** — no identity provider is configured (FR-039). |
| **V. Design** | ✅ PASS | No new token; `tokens:check` must pass **unchanged**. Error state uses the existing `#e01010` destructive token only. **No card is introduced** (R12) — both surfaces already use a plain centred stack, so no justification is owed. The Google mark is the constitution's own **named exception**: *"a third-party sign-in mark whose provider's brand guidelines require its own colours; that is an asset, not a token."* Touch targets ≥48. Dark mode on both. |
| **VI. Layered Architecture** | ✅ PASS | Mobile stays MVVM — and ⚠ **improves**: `pendingEmail`/`pendingReturnTo` move out of loose ViewModel `var`s into the immutable `AuthUiState` (R2), which is what the principle actually requires. Web keeps the server-state cache authoritative; the step machine is genuine client state. No DI framework; explicit wiring unchanged. |
| **VII. Observability** | ⚠ **PASS WITH RECORDED GAP** | Events specified in [contracts/telemetry.md](contracts/telemetry.md). ⚠ **PostHog has never been initialised on `customer-web`**, so every `capture()` — including today's — is a no-op. This slice emits through the existing seam and **does not** take on analytics bootstrap; see Complexity Tracking. |

**No violations requiring justification.** The entries in Complexity Tracking are *deferrals*, recorded so they
are not mistaken for coverage.

---

## Project Structure

### Documentation (this feature)

```text
specs/036-auth-step-flow/
├── plan.md              # This file
├── spec.md              # WHAT/WHY
├── research.md          # Phase 0 — R1…R14
├── data-model.md        # Phase 1 — the step machines + the one persisted field
├── quickstart.md        # Phase 1 — the operator walk
├── contracts/
│   ├── step-flow.md     # The two step machines, screen by screen
│   ├── auth-driver.md   # The mobile AuthDriver additions + the backend edit
│   ├── copy.md          # Every user-visible string, both surfaces
│   └── telemetry.md     # Events, properties, and what is measurable
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
packages/design-system/
├── src/ui/otp-input.tsx              # + variant="cells" (default "plain" — consoles unaffected)
├── src/ui/google-mark.tsx            # NEW — inlined SVG, NOT exported from the ui barrel (bundle)
├── src/tokens.css                    # + the .otp-cells CSS block. NO new token.
└── mobile-assets/drawable/
    └── ic_google_g.xml               # NEW — hand-authored VectorDrawable + Google's licence note

packages/mobile-kit/
├── common/ui/OtpInput.kt             # expect gains `variant`; OTP_LENGTH unchanged
├── common/ui/OtpCells.kt             # NEW — shared cell renderer (commonMain, both actuals use it)
├── android/ui/OtpInput.android.kt    # decorationBox draws cells; over-length falls back to plain
└── ios/ui/OtpInput.ios.kt            # ⚠ gated on SPIKE-1; fallback keeps today's spaced field

apps/customer-web/app/(auth)/
├── _lib/auth-actions.ts              # drop name from signUp; wire classifySignInStep; map SignInException
│                                     #   + ForbiddenException; resend helpers
├── _lib/seed-actions.ts              # ⚠ stop swallowing failures silently
├── _components/StepShell.tsx         # NEW — step chrome, progress, back
├── _components/CodeStep.tsx          # NEW — the ONE code step (replaces 3 duplicated CodeField wrappers)
├── _components/GoogleButton.tsx      # NEW — mark + FR-039 refusal
├── _components/NameStep.tsx          # NEW — reads the record, then PATCHes
├── sign-in/SignInForm.tsx            # → step machine
├── sign-up/SignUpForm.tsx            # → step machine; name removed from step 1; confirm-password removed
├── reset-password/ResetPasswordForm.tsx  # adopts CodeStep; minLength 8 → 12
└── callback/CallbackHandler.tsx      # ⚠ seed the record (latent Google 403)

apps/customer-web/lib/
├── otp-cooldown.ts                   # ⚠ built + tested + NEVER CALLED — wired here
└── amplify-config.ts                 # passwordFormat.minLength 8 → 12

apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/
├── core/auth/AuthDriver.kt           # + resendSignUpCode, resendSignInCode; − name args on signUp*
├── core/nav/CustomerNavKey.kt        # + SignInPassword, SignUpPassword, ProfileName (4 registrations each)
├── app/CustomerShell.kt              # + 3 entry<> blocks
└── features/auth/
    ├── presentation/AuthScreens.kt   # split into step screens; state moves INTO AuthUiState
    └── domain/AuthUseCases.kt        # + ResendSignUpCode, ResendSignInCode

apps/customer-mobile/shared/src/androidMain/.../AmplifyAuthDriver.kt   # ⚠ autoSignIn → mapSignIn (R6)
apps/customer-mobile/iosApp/iosApp/SwiftAuthBridge.swift               # + the two resend bridges

apis/edge-api/customer/src/functions/customer-me-v1-patch.ts           # ⚠ call updateName (DB first, best-effort)
```

**Structure Decision**: no new package and no new service. The work lands in the two customer apps, the two
shared UI packages they already consume, and **one** cold-path handler. `packages/web-kit` is untouched —
`customer-web` does not depend on it, and its only consumers are the out-of-scope consoles.

---

## Phase 0 — Research

Complete. See [research.md](research.md) — R1…R14. The two findings that changed the design:

- **R1** — Amplify's sign-in challenge state is `sessionStorage`-backed with a **3-minute** expiry on hard
  reload and **no cross-tab presence**, and splitting email from password onto separate URLs is what *creates*
  the password-manager problem. → web steps are client state, not routes.
- **R11** — a resend is a **fresh `signIn()`** that burns one of **five hourly sends**, and the sixth **fails
  silently while still showing a code screen**. → the client-side cooldown is load-bearing, and the send count
  is tracked in-flow so the control can refuse honestly instead of firing a no-op.

---

## Phase 1 — Design & Contracts

- **[data-model.md](data-model.md)** — the two step machines as explicit states and transitions; the one
  persisted field (already present); the ephemeral flow state and what must survive iOS process death.
- **[contracts/step-flow.md](contracts/step-flow.md)** — every screen, its controls and its exits, on both
  surfaces, mapped to FRs.
- **[contracts/auth-driver.md](contracts/auth-driver.md)** — the exact `AuthDriver` diff, both actuals, the
  backend PATCH edit, and why `resendSignInCode` is named the way it is.
- **[contracts/copy.md](contracts/copy.md)** — every user-visible string, so web and mobile cannot drift
  (FR-044) and no message claims knowledge the platform lacks (FR-011).
- **[contracts/telemetry.md](contracts/telemetry.md)** — events, properties, and an honest statement of what is
  measurable today.
- **[quickstart.md](quickstart.md)** — the operator walk, including the two blocking spikes and the refusal table.

---

## Spikes — BLOCKING, and they gate different things

Both resolve questions that **AWS and JetBrains do not document**. Neither can be settled by more reading.

### SPIKE-1 — iOS: do Compose cells survive next to one-tap autofill? *(gates the mobile code field)*

Put a colour-cleared (`textColor`/`tintColor = clear`, **never** `hidden` or `alpha = 0`) `UITextField` over
Compose-drawn cells on a **real device** and confirm three things: (1) the QuickType one-time-code suggestion
still appears from a real Effy email; (2) taps reach the field; (3) VoiceOver reports **exactly one** element.

- **If it passes** → cells on all three renderers.
- **If it fails** → ⚠ **iOS keeps today's spaced single field** (which is GOV.UK's actually-shipped design) and
  the split is recorded as justified. **Autofill wins over cells** — it is the highest-value behaviour in this
  component and the only thing here that can be silently destroyed.

### SPIKE-2 — Does confirming sign-up cost a SECOND code? *(gates the sign-up step order)*

This is 035's still-open **T003**. Register a fresh address on dev by the OTP route and observe whether
`confirmSignUp` → `autoSignIn` completes or issues another challenge, and how many digits it carries.

- **The password route is already settled** by source reading (R6): `USER_SRP_AUTH`, custom triggers never
  invoked, **no second code**.
- **If the OTP route issues a second challenge** → the sign-up sequence becomes `email → code → code → name`,
  which is bad enough to justify routing sign-up's completion through a plain sign-in instead. That is a design
  change, not a copy change, which is why this blocks.

⚠ Run SPIKE-2 **before** building the sign-up step machine. Run SPIKE-1 **before** the mobile code field.

---

## Implementation order

Derived from the spec's story priorities, with the two spikes and the shared component first.

1. **Spikes** — SPIKE-1, SPIKE-2. Record outcomes in this plan.
2. **Shared code field** (`otp-input.tsx` + `mobile-kit`) — variant added, default unchanged; **prove the
   consoles are byte-identical** before touching any screen.
3. **US1 · the code step, both surfaces** — address shown, resend + cooldown + countdown, honest refusals,
   attempt exhaustion, "wrong email?", submit at the bottom. Includes the **R9 repair** and the
   `SignInException` / `ForbiddenException` mappings.
4. **US2 · sign-in step machine** — identifier step, password step, forgot-password, back-preserves-email,
   password-manager verification.
5. **Backend + US3 · sign-up + name-last** — `updateName` wiring first (independently a bug fix), then the
   sign-up machine, then the name step. ⚠ `CallbackHandler` record seeding lands here.
6. **US4 · Google** — the mark asset, the button on four screens (two of which have never had one), FR-039.
7. **Sweep** — parity register, the full verification gate, the operator walk.

---

## Amendment A1 — layout & composition (2026-08-05, operator direction)

Added after walking the built screens. Everything sat crammed at the top under one uniform gap, the
code field looked like an ordinary text box, and the committing action floated mid-page. New
requirements: **FR-047 … FR-052**.

**Research findings that decided the design** (full briefings ran before any code):

- ⚠ **There is no first-party "2× rule".** Apple, Google and NN/g publish spacing *scales* and the
  *direction* (between-group > within-group); the 2× heuristic is community convention. So the ratio
  is justified by Gestalt proximity, not cited to a spec — and the numbers come from the tokens that
  exist. ⚠ `EffySpacing` is **4 · 8 · 12 · 16 · 20 · 40 with no 24 or 32 step**, so the honest choice
  is **16 within / 40 between**. Adding a step means editing the generator and committing three
  regenerated Compose files across three apps; it is not worth it for one screen family.
- ⚠ **Neither M3 nor Apple HIG prescribes pinning a form's submit button.** It is observed convention
  plus Hoober's thumb-zone research. Recorded as a judgement, not a mandate.
- ⚠ **The keyboard problem is already solved here, by accident.** `App.kt:213` wraps the whole shell in
  `windowInsetsPadding(WindowInsets.safeDrawing)`, which **includes the IME and consumes it** — so the
  shell shrinks when the keyboard opens and a `Scaffold(bottomBar=…)` inside sits above it for free.
  **`imePadding()` in the auth screens would be a no-op.** (`AuthScaffold`'s own `safeDrawing` call was
  already dead weight for the same reason.)
- ⚠ **Do not pin the footer link separately.** Two independently-pinned bottom elements compete for the
  same thumb zone and the same inset. The footer is pushed to the bottom of the scroll column instead.
- ⚠ **Full-bleed is right on a phone and wrong on a desktop.** Published guidance is to keep the digit
  group compact and centred rather than spread across a wide layout — so mobile fills its column and
  caps at 360 dp, and web sizes from the font inside its 384 px card.
- ⚠ **"Terms, Privacy Policy and Cookie Use" is a US framing and is not safe to copy.** Cookie and
  marketing consent need a separate affirmative act under ePrivacy; only Terms (agreed) and Privacy
  (acknowledged) may ride on a passive sentence. The notice sits **above** the action because the
  action is bottom-pinned, and *Berman v. Freedom Financial* turns on conspicuousness — below it would
  be the first thing pushed out of view. Full contrast and underlined links, because a monochrome
  palette has no colour to carry link-ness (WCAG 1.4.1 / F73).

**Reused rather than invented**: the `Scaffold(bottomBar = …)` shape already established by
`PasswordScreens.kt`'s `PasswordStepScaffold`, two directories away, for exactly this kind of
multi-step credential flow.

⚠ **FR-051's cost, stated plainly**: recovery becomes three screens, but 012's FR-022b forbids
verifying the code separately — it must travel with the new password in one request, or a stealable
"you may now set a password" state exists. So the code step **collects** and the password step
**spends**, and a mistyped code is reported one screen later than the shopper would like.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| ⚠ **SPIKE-1 fails and iOS loses cells** | Medium | Fallback is *today's shipped design*, not a regression. Recorded as a justified split, not hidden. |
| ⚠ **SPIKE-2 reveals a second code** | Medium | Forces a design change in sign-up; that is exactly why it blocks rather than being discovered mid-implementation. |
| ⚠ **A prominent resend burns the 5/hour budget** and the sixth send fails silently | **High** | 30 s cooldown + in-flow send counter + honest local refusal. ⚠ The counter is per-flow: another tab or device is invisible to us, and the UI must not pretend otherwise (FR-011). |
| Amplify upgrade drops `signInStore` persistence | Low | It is an `@internal` module whose own TODO promises a rewrite. Add a test asserting the four `CognitoSignInState.*` keys exist after `signIn()`. |
| ⚠ **Changing the shared field breaks the two consoles** | Medium | Variant defaults to `"plain"`; consoles pass no `className` and are not opted in. Seven test files re-run unchanged as the proof. |
| ⚠ **The name step 403s with the *barred customer* message** | Medium | Read the record (`GET /me`, idempotent create) before PATCHing. This is why `seed-actions.ts`'s two silent exits are fixed. |
| Cells silently misalign if `--font-mono` ever becomes proportional | Low | The technique needs monospace for `1ch`. Add a `check-tokens.mjs`-style assertion — this repo's own idiom for exactly this failure mode. |
| Bundle regression on guest routes | Low | The Google mark is **inlined and kept out of the `ui` barrel**; auth routes are unmeasured but the barrel reaches guest routes. Measure the nine routes. |
| ⚠ **Playwright `otp-entry.spec.ts` pins truncation** | Certain | `:65-71` asserts an 8-digit paste becomes `"123456"` — the **opposite** of FR-004. The test encodes the defect and must be inverted, exactly as 029's `banner_test.go` was. |

---

## Complexity Tracking

| Deferral | Why | Consequence, recorded not hidden |
|---|---|---|
| **PostHog is not initialised on `customer-web`** | Platform-wide analytics bootstrap is its own slice; folding it into an already-wide UI change would couple two unrelated risks. | ⚠ Every `capture()` on the storefront is a **no-op today**, including the existing `sign_in_completed`. **SC-006 and SC-007 must be measured by observed sessions**, not dashboards. Events are still emitted so they begin working the day the seam is initialised. |
| **The consoles' code screen keeps no resend and no countdown** | Out of scope by FR-044a. | ⚠ Those audiences have **no password fallback** — a driver, shop operator or admin whose code does not arrive has no way in at all. Recorded as FR-044b, a follow-on, and it is a stronger case than the customer one. |

---

## Post-Design Constitution Re-check

Re-evaluated after the Phase 1 artifacts. **Still passing**, with three things worth stating plainly:

- **Principle II strengthened, not merely preserved**: the three duplicated `CodeField` wrappers in
  `app/(auth)/` collapse into one `CodeStep`, and the mobile recovery and password-flow screens — which today
  use a plain `EffyField` with a hardcoded `"6-digit code"` placeholder, no digit filter and no autofill —
  adopt the shared component. FR-045's "one shared definition" becomes true where it currently is not.
- **Principle VI strengthened**: mobile's flow state stops living in loose ViewModel `var`s.
- **Principle V unchanged**: no token added, no card introduced, one named exception used exactly as written.

The only gate that moved is **VII**, and it moved to *pass with a recorded gap* rather than a silent pass.
