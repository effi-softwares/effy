# Quickstart: Verifying 036 — Customer Sign-in & Sign-up Step Flow

**Date**: 2026-08-05 · **Plan**: [plan.md](plan.md) · **Spec**: [spec.md](spec.md)

This is the **operator's** guide. Claude writes the code and runs the machine checks; every step below that
touches live AWS, a real inbox, or a device is yours.

⚠ **§1 blocks implementation.** The two spikes resolve facts AWS and JetBrains do not document, and each one
can change the design.

---

## 0 · Prerequisites

```bash
pnpm install
```

- Dev pools applied, `edge-api/auth` deployed (035 is live in dev).
- ⚠ **A real inbox that SES can deliver to.** SES is in **SANDBOX** — only individually verified recipients
  receive mail. Verify your test address first, or nothing in §2–§5 works and it will look like a code bug.
- iOS simulator + a **physical iPhone** (SPIKE-1 needs the real QuickType bar).
- An Android emulator or device. ⚠ **Android has not been looked at across 028, 029, 033 or 035.** This is the
  fifth slice; please break the streak.

---

## 1 · ⚠ SPIKES — run these before any implementation

### SPIKE-1 · iOS: do Compose cells survive next to one-tap autofill?

Build the throwaway harness (a colour-cleared `UITextField` over Compose-drawn cells) on a **physical device**,
trigger a real Effy code, and record three answers:

| Check | Pass looks like |
|---|---|
| QuickType offers the code from Mail | The one-tap suggestion appears above the keyboard |
| Taps reach the field | Tapping any cell focuses and the caret behaviour is sane |
| VoiceOver reports **one** element | Exactly one control announced *"One-time code"* |

- **All three pass** → cells ship on web, Android and iOS.
- **Any fail** → ⚠ **iOS keeps today's spaced single field** (GOV.UK's actually-shipped design), recorded as a
  justified split. **Autofill beats cells.** Do not trade it away.

**Record the outcome in [plan.md](plan.md) §Spikes before writing the component.**

### SPIKE-2 · Does confirming sign-up cost a SECOND code? *(035's open T003)*

Register a **fresh, never-used** address on dev via the **OTP** route and watch what happens after
`confirmSignUp`.

| Observation | Consequence |
|---|---|
| Signed in immediately, one email total | ✅ The planned `email → code → name` sequence holds |
| A second challenge appears | ⚠ **Design change**: either `email → code → code → name`, or route sign-up's completion through a plain sign-in instead |
| The second code has **8** digits | ⚠ Cognito's managed factor leaked in — escalate; this is the 035 consistency gap made real |

The **password** route is already settled by source reading (R6) — `USER_SRP_AUTH`, custom triggers never
invoked, no second code. You need only walk the OTP route.

---

## 2 · The code step — the 12-check table

⚠ **035 shipped with this table entirely unobserved.** It is the heart of the slice; walk every row on **every**
surface (customer-web, iOS, Android) and tick it or write down what happened.

| # | Check | Expected | FR |
|---|---|---|---|
| 1 | The step names the address | *"We sent a code to a•••@…"* | FR-006 |
| 2 | Resend is disabled at first, with a live countdown | *"Send another code in 29s"* | FR-007 |
| 3 | Resend works at 0 and the countdown restarts | New email arrives | FR-007 |
| 4 | The resend confirmation points at the **newest** email | Says the older code no longer works | FR-008 |
| 5 | ⚠ **Paste 8 digits** | All eight stay visible; submit stays **disabled**. ⚠ **Not truncated to 6** | FR-004 |
| 6 | Paste 6 digits | Accepted; submit enables | FR-002 |
| 7 | ⚠ Wrong code, attempt 1 | Refusal shown, **stays on the step**, digits **not cleared**. ⚠ Must **not** navigate away | FR-010, FR-012 |
| 8 | ⚠ Wrong code ×3 | The "start again" step, one action to a fresh code | FR-013 |
| 9 | Wait 5+ min, then submit a valid-looking code | A refusal, never a silent success | FR-011 |
| 10 | Request a code, then request another, then use the **first** | Refused — supersession is real from the UI | FR-008 |
| 11 | *Change it* returns to step 1 with the email intact | Email present | FR-014 |
| 12 | ⚠ **Ask for 6 codes in one clock hour** | The 6th is refused **locally** with an honest message — **not** a code screen for an email that will never arrive | FR-009, R11 |

⚠ **Row 12 is the one nobody thinks to test and the one that strands real shoppers.**

⚠ **Log sweep**: after the walk, `grep` the trigger logs for any six consecutive digits. A code must never
appear in a log.

---

## 3 · Sign-in

| # | Check | FR |
|---|---|---|
| 1 | Step 1 offers the code route and Google; password is a secondary link | FR-016, FR-017 |
| 2 | The password step **shows** the email rather than asking again | FR-018 |
| 3 | *Forgot your password?* is on the password step and starts the reset journey | FR-019 |
| 4 | Back from the password step keeps the email — ⚠ by control, **browser back**, and device gesture | FR-022 |
| 5 | ⚠ **Password managers**: fill on the password step, then save against the right email. Test **Chrome/Safari built-in AND Bitwarden** — Bitwarden is the weaker case | FR-023, SC-009 |
| 6 | *Don't have an account? Join* is on every step | FR-021 |
| 7 | ⚠ An **unknown** address produces an identical screen sequence and identical wording | FR-024, SC-012 |
| 8 | Sign in from mid-checkout → back to checkout, **not** Home | FR-025, SC-013 |
| 9 | Sign in deliberately from the account tab → Home | FR-025 |
| 10 | ⚠ Web: hard-reload the code step after **3+ minutes** | *"Your sign-in timed out"* and a return to step 1 — **not** "Something went wrong" (R1) |
| 11 | ⚠ Web: open the code step in a **new tab** | Degrades to step 1, never a dead form |

---

## 4 · Sign-up and the name step

| # | Check | FR |
|---|---|---|
| 1 | ⚠ Step 1 asks for an email and **nothing else** — no name anywhere | FR-027, SC-005 |
| 2 | The password step asks for the password **once**, with a reveal, ⚠ **no confirm field** | FR-030 |
| 3 | ⚠ The rule says **12** characters and no composition rules — check sign-up **and** reset-password | FR-029, R8 |
| 4 | Both routes reach the same code step | FR-031 |
| 5 | After the code, the name step appears and ⚠ **you are already signed in** | FR-034 |
| 6 | The name step cannot be skipped | FR-035a |
| 7 | ⚠ **Force-quit at the name step, reopen** | Still signed in, asked again, **no "account broken" message** | FR-035a, SC-015a |
| 8 | ⚠ **The name appears in the web header greeting** after a full restart — this is the `updateName` fix | FR-035, SC-015 |
| 9 | The name appears on the account page and on mobile's account tab | FR-035 |
| 10 | ⚠ Guest with a full basket → register by **each** route → basket and saved items survive | FR-037, SC-014 |
| 11 | ⚠ Sign up, then use the account page to change the name → the header updates | R5 |

⚠ **Check 8 is the one that would silently fail.** Before this slice, `updateName()` had **no caller**, so the
greeting showed the old name forever. If it lags, the Cognito write or the token refresh is broken — not the
name step.

---

## 5 · Google

| # | Check | FR |
|---|---|---|
| 1 | The button appears on sign-in and sign-up, on **both** surfaces — ⚠ mobile has never had one | FR-038 |
| 2 | The mark is Google's standard colour version, unrecoloured, with text beside it | FR-038, R7 |
| 3 | ⚠ Choosing it says *"Google sign-in isn't available yet"* — **not** a generic error | FR-039 |
| 4 | Light and dark both legible | FR-041 |

---

## 6 · Accessibility, appearance, and the machine gate

| # | Check | FR |
|---|---|---|
| 1 | Whole flow by keyboard alone (web) | SC-016 |
| 2 | Whole flow by screen reader alone — VoiceOver **and** TalkBack | SC-016 |
| 3 | ⚠ The code field announces as **one** control named *"One-time code"* | FR-002 |
| 4 | The countdown is announced and ⚠ **does not steal focus** | FR-015 |
| 5 | Largest supported text size, light **and** dark, on both surfaces | SC-017 |
| 6 | Every control ≥ 48 dp/px | FR-042 |

```bash
# Machine gate — all must pass
pnpm -r typecheck                      # expect 13/13
pnpm -r test
pnpm --filter @effy/design-system tokens:check   # ⚠ MUST be unchanged — no token added
bash scripts/check-no-emerald.sh && bash scripts/check-no-jade.sh
bash scripts/mobile-guard.sh
pnpm --filter @effy/customer-web depcruise       # ⚠ the Amplify quarantine
pnpm --filter @effy/customer-web build && pnpm --filter @effy/customer-web size
pnpm --filter @effy/customer-web exec playwright test

cd apps/customer-mobile && ./gradlew :shared:testAndroidHostTest \
  :shared:compileKotlinIosSimulatorArm64 :shared:compileTestKotlinIosSimulatorArm64 \
  :androidApp:assembleDebug
```

⚠ **`size` must show the nine guest routes byte-identical.** `/search` has **2.0 KB** of headroom. Do **not**
raise the limit.

⚠ **`compileTestKotlinIosSimulatorArm64` is not optional** — 033 discovered the iOS *test* compilation had never
run, while every "iOS compiles" claim covered only the main source set.

---

## 7 · Tests that must be **inverted**, not just updated

⚠ These currently assert the behaviour this feature exists to remove. Change them deliberately and say so.

| Test | Asserts today | Must become |
|---|---|---|
| `apps/customer-web/e2e/otp-entry.spec.ts:65-71` | An 8-digit paste becomes `"123456"` | ⚠ All eight stay; submit disabled (FR-004) |
| `e2e/deferred-signin.spec.ts:125-137` | Sign-up shows First/Last name on both routes | ⚠ Step 1 shows **neither**; they appear only at the name step |
| `e2e/deferred-signin.spec.ts:139-155` | The password route confirms the password | ⚠ One password field, reveal toggle, no confirm |
| `e2e/deferred-signin.spec.ts:157-163` | The Google button count is 0 | ⚠ It is now 1 on each screen |

⚠ **Tests that must keep passing untouched — they are the proof the consoles were not disturbed:**
`packages/web-kit/src/console/OtpSignInCard.test.tsx` (esp. `:121` one-node, `:132` maxlength),
`apps/back-office/src/features/auth/SignInScreen.test.tsx`,
`apps/shop-web/src/features/auth/SignInScreen.test.tsx`,
`apps/shop-mobile/.../OtpInputTest.kt` (esp. `:40-41` — ⚠ `normalizeOtp("12345678")` stays `"12345678"`).

---

## 8 · Sign-off

- [ ] Both spikes run and their outcomes recorded in [plan.md](plan.md)
- [ ] §2's 12 checks walked on **web, iOS and Android** — ⚠ including row 12
- [ ] §3–§6 walked on both surfaces
- [ ] Machine gate green; guest bundle byte-identical
- [ ] Inverted tests changed deliberately; console tests pass **unmodified**
- [ ] `docs/audiences/customer-capabilities.md` updated — ⚠ including **correcting rows 5–13**, whose mobile
      column has read `⬜` since 013 despite mobile having the full auth stack (FR-046)
- [ ] A `SIGNOFF.md` recording what was **not** walked, honestly

⚠ **Known limits of this walk, stated up front:**
- Telemetry is unmeasurable — PostHog is not initialised on `customer-web`. SC-006/SC-007 come from watching
  five people, not from a dashboard.
- SES sandbox means only verified addresses can be tested. The unknown-address check (§3.7) still works,
  because the platform's response is identical either way — which is the point.
- The 5-per-hour ceiling (§2.12) takes a real hour to test properly. Do not skip it because it is slow; it is
  the failure mode with no server-side signal reaching the shopper.
