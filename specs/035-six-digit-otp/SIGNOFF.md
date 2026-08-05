# Sign-off record — 035-six-digit-otp

**Status**: ✅ **CONCLUDED (PARTIAL BY DESIGN) 2026-08-04 — deployed to dev and PROVEN LIVE on one
surface.** · **Date**: 2026-08-03, concluded 2026-08-04

**The platform now issues its own sign-in code, and a real person has signed in with one.** Confirmed
by the operator on **customer-mobile (iOS simulator)** against the live dev pools.

⚠ **"Concluded" closes the slice; it does not make the open items true.** One surface of five was
walked, on one platform of two, and the formal 10-check table in quickstart §5 was not completed.
Read § "What is still NOT proven" before relying on any of it.

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

## ✅ What the live run DID prove

Deployed to dev and exercised by the operator on **customer-mobile (iOS simulator)**:

- The four triggers are attached to all four pools and invoke correctly.
- `CUSTOM_AUTH` is reachable; the client asks for it and Cognito honours it.
- A code is generated, emailed via SES, delivered, and **accepted** — a full sign-in completes.
- The audience map resolves the pool (`otp_unknown_pool` stopped firing).
- The HMAC secret, the DynamoDB counter and the SES send path all work end to end.
- ⚠ **Sign-up on the same surface still works**, confirming FR-003 — the `ConfirmSignUp` code is
  untouched by this feature.

**The code length itself is proven by unit test, not by the live walk** — `generateCode()` is
`String(randomInt(0, 10**6)).padStart(6, "0")`, asserted over 2,000 iterations plus an explicit
leading-zero case. The operator did not report a digit count, so SC-002 is **satisfied by
construction rather than by observation**.

## ⚠ What is still NOT proven

1. ⚠ **T001 was never run.** The premise — that managed `EMAIL_OTP` emitted 8 digits — appears in
   **no official AWS document** and was never measured on this platform. It no longer blocks
   anything (the new flow works regardless), but the slice's founding claim remains unverified, and
   the shop-mobile defect it was inferred from is still the only hard evidence.
2. ⚠ **The three spikes (T002, T003) are unrun.** In particular T003(c): what `autoSignIn` does now
   that triggers are attached. Sign-up worked in the live run, which is weak evidence it is fine —
   but nobody counted whether one code or two arrived.
3. ⚠ **Four of five surfaces are unwalked**: back-office, shop-web, shop-mobile and customer-web.
   ⚠ **shop-mobile matters most** — its broken sign-in (SC-001) is the defect that justified the
   whole slice, and it has not been confirmed fixed on a device.
4. ⚠ **The 10-check table in quickstart §5 was not completed on any surface** — wrong code ×3,
   expiry, supersession, the rate limit, the 8-digit paste refusal, and the log-leak sweep are all
   unobserved. These are the compensating controls that make six digits defensible.
5. ⚠ **Existence parity (SC-007) is structural, not measured.** No stopwatch was put on a real vs
   unknown address.
6. ⚠ **`email_verified` (FR-020) was not inspected.** Its failure is silent and surfaces only later,
   as a refused Google link.
7. ⚠ **Android has never been looked at** across 028, 029, 033 — and now 035. SC-014 said that would
   not repeat. It repeated.

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

## ⚠ BLOCKING FOR PRODUCTION — email deliverability

Recorded as the single largest open risk on this feature, deliberately deferred by the operator on
2026-08-04.

**⚠ SUPERSEDED 2026-08-05 by 037 — this is no longer true.** `ProductionAccessEnabled` is **true**
(review case `178578384200127`, 50,000/day at 14/sec), and the bounce-visibility gap named below
is BUILT. Left in place rather than deleted because the change of state is itself the lesson: this
blocker sat at the top of the platform's risk list for weeks after it had been resolved, because
nobody re-checked. Original text follows.

~~**SES is in SANDBOX** (`ProductionAccessEnabled: false`).~~ It delivers only to individually verified
recipient addresses. On this platform that is not a limitation, it is a **hard ceiling on who can
sign in at all** — email is the ONLY credential, and three of four audiences have no password
fallback. A sandbox storefront cannot onboard a single real customer.

Required before any production use:
1. **SES production access** for `ap-southeast-2` (`aws sesv2 put-account-details`, ~24h review).
2. ⚠ **A website at `effyshopping.com`.** There is currently **no A or CNAME record anywhere** on the
   apex or `www` — the domain resolves to nothing. AWS reviewers visit the URL on the request, and a
   dead link is a common rejection.
3. ⚠ **Bounce visibility, which does not exist.** There are CloudWatch alarms on bounce and complaint
   RATES, but nothing reports WHICH address bounced. On a platform where email is the only
   credential, a customer whose address hard-bounces is **permanently locked out and nobody finds
   out** — they land silently on the SES suppression list and every future sign-in fails with no
   signal. This needs a configuration set with an SNS event destination. It is a product defect, not
   an SES compliance box, and it deserves its own slice.

## Next step

Walk quickstart §5 on **shop-mobile** — SC-001, the journey that could not be completed at all
before this slice, is still unconfirmed on a device.
