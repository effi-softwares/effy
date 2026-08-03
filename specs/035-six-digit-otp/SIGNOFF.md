# Sign-off record — 035-six-digit-otp

**Status**: 🚧 **92 / 128 tasks — every code, test and Terraform task BUILT and machine-verified.**
**33 operator steps remain, and NOTHING has been deployed.** · **Date**: 2026-08-03

⚠ **This is not a sign-off. It is a handover.** The feature is code-complete and cannot be
*validated* without a real inbox and live AWS. Read § "What is not proven" before treating any of it
as done.

---

## What this feature does

Every one-time code Effy issues is now **six digits**, on every surface, for every audience.

Cognito's managed `EMAIL_OTP` factor emits **eight**, and its length is not configurable on the user
pool, the app client, `SignInPolicyType`, `EmailMfaConfigType`, the message templates, the managed
login branding, or the Terraform provider schema. The AWS Amplify team closed the standing request
as a Cognito-side limitation. A Custom Email Sender trigger cannot help either: it receives the code
Cognito already generated and has no response field to hand a different one back — emailing our own
code from there would lock out every user.

So the platform now **issues the code itself**, through a Cognito custom challenge.

---

## ⚠ Three defects found and fixed during implementation

**1. A brute-force bypass in my own state machine — found by my own test.**
`decideNextStep` checked SUCCESS before the attempt cap, so a session of
`[wrong, wrong, wrong, correct]` returned `issue-tokens`. A late correct answer bought tokens the
three-attempt cap was supposed to deny. Cognito should never present a fourth answer — `fail` ends
the flow — but *"should never"* is not a control, and this is the authentication path. The cap is now
evaluated first, and reverting the ordering makes `bruteforce.test.ts` fail.

**2. `normalizeOtp` truncated, and FR-004 forbids it.**
The promoted mobile control filters non-digits and **does not truncate**. The old `.take(6)` is
literally the shipped shop-mobile defect: it cut a real 8-digit code to its first six and submitted
the wrong value. ⚠ **No test covered it** — the one test that touched normalisation fed
`" 12-34 56 words"`, which contains exactly six digits and passed identically before and after the
bug. That is how it shipped.

**3. `NotAuthorizedException` now means two different things.**
On the password route it is a credential mismatch; on the code route it is *"you used all three
attempts"*. customer-web showed the password wording to passwordless shoppers — nonsense they cannot
act on. `authErrorMessage` now takes a route context. ⚠ The code-route wording is deliberately
identical to what an unknown address produces, so the refusal is not an existence oracle.

## ⚠ One task in my own plan that was wrong, and reversed

**T071 said to remove `autoSignIn` from sign-up. That would have been a regression.** The code a
customer types there is the `ConfirmSignUp` code — already six digits, untouched by FR-003 — and
`autoSignIn` issues no code of its own, so FR-001 is not engaged. Removing it would have left them
confirmed but signed out, needing a **second** code where there is currently one. Reversed, and
added to spike T003 as question (c), because what `autoSignIn` does once triggers are attached is
documented nowhere.

---

## Built

| | |
|---|---|
| `apis/edge-api/auth` | New cold-path service; 4 Cognito triggers; **100 tests** |
| `packages/design-system/src/ui/otp-input.tsx` | Web field — ⚠ **zero new dependencies** |
| `packages/mobile-kit/{common,android,ios}` | Restructured for its first platform component; shared OTP field |
| `infra/envs/dev/otp-store.tf` | DynamoDB counter, HMAC secret shell, 4 alarms |
| `infra/envs/dev/waf-user-pools.tf` | Per-source rate limiting — ⚠ **not buildable in a Lambda** |
| 6 client surfaces | `CUSTOM_WITHOUT_SRP` + the new step on every driver and bridge |
| `scripts/verify-pool-credentials.sh` | Extended — ⚠ it would have passed silently otherwise |

**Design property worth stating: the code is never persisted anywhere.** It lives in the shopper's
inbox and as a keyed hash in Cognito's own challenge metadata. Attempt counting is free from
`session[]`. The only stored state in the entire slice is one hourly counter over a *hashed* address.
**No Goose migration.**

## Verified (machine)

13/13 typecheck · **997 JS/TS tests** · 86 shop-mobile + 238 customer-mobile tests · both apps
compile Android **and** iOS — ⚠ including `compileTestKotlinIosSimulatorArm64`, which 033 discovered
had *never* run · `terraform validate` + `fmt` · `depcruise` clean · both mobile guards ·
`tokens:check` unchanged · `check-no-emerald` / `check-no-jade` · shellcheck · `turbo build` 3/3 ·
**bundle byte-identical on all nine guest routes** (`/search` 172.0 / 174 KB).

**Six negative proofs** — code broken deliberately, test confirmed to fail, code restored: the
attempt-cap off-by-one; phantom-user token issuance; missing zero-padding; the guard's flow
assertions; `normalizeOtp` truncation; and the bypass in defect 1.

---

## ⚠ What is NOT proven

**Nothing has been deployed. No code has ever been sent. No one has signed in.**

1. ⚠ **The premise is unmeasured (T001).** That managed `EMAIL_OTP` emits 8 digits appears in **no
   official AWS document** — it rests on Amplify engineers' statements and this platform's
   observation. **If it measures 6, most of this feature is unnecessary.**
2. ⚠ **Three blocking spikes are unrun (T002, T003).** Whether an `UNCONFIRMED` user can start
   `CUSTOM_AUTH`; whether a sign-up-only client closes the customer bypass; what `autoSignIn` does
   with triggers attached. Each can change the design.
3. ⚠ **Timing parity is structural, not measured.** The tests assert the same calls happen on both
   paths. Whether an unknown address *actually* answers in the same time is SC-007, and needs a
   stopwatch against the dev pool.
4. ⚠ **No automated test can complete a sign-in**, because there is no way to read a sent email in
   this repo — no MailHog, no SES event destination, no test inbox. That is stated rather than faked.
5. ⚠ **Android has never been looked at** across 028, 029, 033 — and now 035. SC-014 says that does
   not repeat. It has not yet been prevented.

## ⚠ Known gap, recorded not hidden

The **customer pool keeps `ALLOW_USER_AUTH`**, because passwordless `SignUp` is legal only while it
is present. So Cognito's managed **8-digit** flow stays reachable there by a raw `InitiateAuth` call,
bypassing the 3-attempt cap, the 5-minute TTL and both rate limits. No Effy surface does this, and it
yields a *stronger* credential — a **consistency gap, not a privilege escalation**. Spike T003(b)
tests whether a sign-up-only app client closes it.

The obvious alternative — a random throwaway password at sign-up — is **rejected**: it breaks 012's
set-first-password flow, which calls `ChangePassword` without `PreviousPassword` and only works on an
account that genuinely has no password.

## Carry-forwards

- **Client telemetry: now thirteen consecutive slices deferred.** PostHog has never been initialised
  on customer-web, so SC-012/SC-013-style client measurement remains impossible platform-wide.
- **No email-reading test mechanism** still does not exist. Building one (a dev-only SES event
  destination → SQS) is the single change that would make OTP flows end-to-end testable.
- **`driver-mobile` has no sign-in screen.** FR-006 binds it when it grows one; the pool and triggers
  are already wired.
- **`AUTO_CONFIRM_SIGNUP` is wired but OFF**, pending T003(a).

## Next step

`quickstart.md` §1 — request one sign-in code and one reset code against dev and count the digits.
Five minutes, and it either confirms the premise or saves the rest of the feature.
