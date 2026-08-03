# Quickstart — Platform-Wide Six-Digit One-Time Codes

**Feature**: 035-six-digit-otp · **Date**: 2026-08-03

Validation guide. ⚠ **Everything that touches live AWS is an operator step** — Claude authors the
Terraform, the Lambda source and the migration-free wiring, and hands the apply/deploy/measure steps
here. See [plan.md](plan.md) and [contracts/auth-triggers.contract.md](contracts/auth-triggers.contract.md).

⚠ **This is authentication.** A mistake does not degrade a feature — it locks four audiences out of
the platform, including the admin console used to fix it. Read §0 before running anything.

---

## §0 — Before you touch anything

**Break-glass**: if sign-in breaks after a step, the fastest recovery is **reverting the client's auth
flow constant** (§7), not a Terraform apply. Detaching `lambda_config` also works and is a single
in-place pool update. Keep a signed-in admin browser session open in another window throughout — a
valid refresh token survives an auth-flow change and is your way back in.

**Prerequisites**: `AWS_PROFILE=ef`, `ENV=dev`, region `ap-southeast-2`, `goose` installed, a real
inbox you control for **each** audience you migrate.

---

## §1 — ⚠ BLOCKING: measure the premise (T001, FR-037)

**Do this first. The whole feature rests on it, and it is not stated in any AWS document.**

```bash
# 1. Request a sign-in code on any surface today (e.g. back-office at :5173, or shop-web at :5174)
#    → open your inbox, COUNT THE DIGITS.
# 2. Request a password-reset code on customer-web (/reset-password)
#    → open your inbox, COUNT THE DIGITS.
```

| Expected | Sign-in **8** · reset **6** |
|---|---|

⚠ **If sign-in is already 6, STOP.** The premise is false, and most of this feature is unnecessary —
return to the spec (Principle I: fix the earliest affected artifact, never patch downstream).
Record the measured values in this file before continuing.

---

## §2 — ⚠ BLOCKING spikes (T002, T003)

Both are cheap and both can change the design. Neither is answerable from documentation.

### T002 — the refusal, and whether it leaks existence

```bash
POOL=$(aws ssm get-parameter --name /effy/dev/auth/back-office/user_pool_id --query Parameter.Value --output text)
CLIENT=$(aws ssm get-parameter --name /effy/dev/auth/back-office/app_client_id --query Parameter.Value --output text)

# (a) a REAL user, wrong code three times — capture the exact exception name and message
# (b) an address with NO account — same sequence
aws cognito-idp initiate-auth --auth-flow CUSTOM_AUTH \
  --client-id "$CLIENT" --auth-parameters USERNAME=nobody-$RANDOM@example.com,CHALLENGE_NAME=CUSTOM_CHALLENGE
```

**Record**: exception name, message, HTTP status, and **wall-clock latency** for both. ⚠ They must be
identical. A latency delta is an existence oracle even when the bodies match (FR-016, SC-007).

### T003 — the two design-deciding questions

```bash
# (a) Can an UNCONFIRMED user start CUSTOM_AUTH, or does Cognito refuse BEFORE the triggers fire?
#     Sign up a user without confirming, then initiate-auth CUSTOM_AUTH.
#     Check CloudWatch: did DefineAuthChallenge log an invocation at all?
#     → If refused: PreSignUp autoConfirmUser:true is MANDATORY (research R4a).
# (b) Can ALLOW_USER_AUTH live on a SIGN-UP-ONLY client while the sign-in client is CUSTOM_AUTH-only?
#     → If yes, the customer-pool bypass (research R4b) closes. If no, it is an accepted, recorded risk.
# (c) ⚠ ADDED DURING IMPLEMENTATION. With the triggers attached, sign up a NEW customer through the
#     email-code route and count the codes they receive before they are signed in.
#       expect 1 (ConfirmSignUp only, autoSignIn completes the session — today's behaviour)
#       if 2   → autoSignIn is initiating a fresh challenge; check whether the second code is 6 or 8
#                digits, and if 8 the customer sign-up route needs rework before it can ship.
```

⚠ Note for (a): this platform uses `username_attributes = ["email"]`, **not** `alias_attributes`. AWS's
"a user can sign in with an alias only if the alias is verified" warning is about aliases. Confirm the
distinction holds — if it does not, the passwordless sign-up flow deadlocks.

---

## §3 — Machine-verifiable, before any AWS call

```bash
make edge-install
make edge-test                    # ⚠ requires the package to be named @effy/edge-auth
pnpm -r typecheck                 # expect 13/13 (12 today + the new service)
pnpm -r test
pnpm exec turbo build

make fmt && make validate ENV=dev
make cw-gates                     # depcruise + bundle budget
make cm-guard && make sm-guard
make cm-tokens-check
make verify-pool-credentials ENV=dev
cd apps/shop-mobile && ./gradlew :shared:testAndroidHostTest && cd -
cd apps/customer-mobile && ./gradlew :shared:testAndroidHostTest :shared:compileKotlinIosSimulatorArm64 && cd -
```

⚠ **The bundle budget is the one to watch.** `/search` has **2.1 KB** of headroom against 174 KB. The
shared OTP field is a plain input by design (research R11) and should be byte-neutral on guest routes —
**measure, do not assume**, and never raise the limit to make it pass.

⚠ **`verify-pool-credentials.sh` must have been extended in this slice** to assert `ALLOW_CUSTOM_AUTH`
state. Unextended, it reports ✓ PASS while four pools gain a new first-factor flow — the exact failure
its own header warns about (research R14).

---

## §4 — Deploy, in this order. The order is load-bearing

```bash
# 1. Lambdas FIRST — Cognito validates the trigger on UpdateUserPool, so the ARNs must exist
make edge-deploy SERVICE=auth ENV=dev

# 2. Record the four ARNs into infra/envs/dev/dev.tfvars (the same two-stage dance as pre_sign_up)

# 3. ⚠ PLAN AND READ IT — the single most important command in this file
make plan ENV=dev 2>&1 | tee /tmp/035-plan.txt
grep -nE 'must be replaced|forces replacement|-/\+' /tmp/035-plan.txt
```

⚠⚠ **If that grep returns ANY line naming `aws_cognito_user_pool` or `aws_cognito_user_pool_client` —
STOP. Do not apply.** A replaced pool destroys the 006 first admin, every 009 shop operator, and every
customer. Expected output: **in-place updates only** (FR-030, SC-012).

```bash
# 4. Apply — attaches lambda_config, WAF, DynamoDB table, client flow changes
make apply ENV=dev

# 5. Confirm mail can actually leave the building — under this design, no email = no sign-in
make mail-verify ENV=dev
```

⚠ `make mail-verify` warns rather than fails when SES is in the **sandbox** (200/day, verified
recipients only). ⚠ Note `ses_sender_enabled = false` in dev today — that flag governs which sender
**Cognito** uses; our Lambda sends via SES directly and is unaffected. But **production access is a
hard prerequisite before migrating the customer audience.**

---

## §5 — Roll out one audience at a time. Internal first

Order: **back-office → shop → driver → customer-web → customer-mobile**. Internal audiences are small,
employee-only populations where a failure is a support ticket rather than a lost shopper.

After each audience, before moving on:

| # | Check | Expects |
|---|---|---|
| 1 | Sign in on that surface with a real inbox | **6-digit code**, accepted first try (SC-002, SC-003) |
| 2 | Paste the code with spaces/dashes | Accepted in one action (SC-004, FR-026) |
| 3 | Paste an 8-digit value | ⚠ **Refused, not truncated** (FR-004, FR-005) |
| 4 | Wrong code ×3 | 3rd allowed, 4th refused; distinct message (FR-011, FR-027) |
| 5 | Wait 6 minutes, then submit | Refused as expired, with a way to get a new one (FR-008) |
| 6 | Request a 2nd code, submit the 1st | Refused as superseded (FR-010) |
| 7 | Request 6 codes in an hour | 6th refused with a retry-after (FR-012, SC-005) |
| 8 | An address with no account | ⚠ Identical response **and latency**; **no email sent** (FR-016, SC-007) |
| 9 | CloudWatch Logs Insights: `filter @message like /[0-9]{6}/` | ⚠ **Zero hits** (FR-014, SC-008) |
| 10 | Existing signed-in session | Still valid; nobody signed out (FR-021, SC-012) |

⚠ **Check 9 is the one people skip.** Run it after every audience, not once at the end.

### Customer-only, additionally

| # | Check | Expects |
|---|---|---|
| 11 | Brand-new account via the code route | Confirmed, `email_verified: true` — verify with `admin-get-user` (FR-020, SC-009) |
| 12 | Then link Google on the same address | Links into the **same** account, one `sub` (FR-022, SC-009) |
| 13 | Password reset, set-first-password, account closure | ⚠ All still **6 digits and still working** — untouched (FR-003) |
| 14 | Email+password sign-in | Still works (FR-032) |
| 15 | A barred customer with a correct code | Refused (FR-023) |

⚠ **Check 11 is the most likely silent failure in the slice.** Nothing breaks visibly if
`email_verified` is missed — until check 12 refuses, possibly weeks later.

---

## §6 — Cross-audience isolation (FR-018, FR-031)

```bash
# A code issued for the shop pool, submitted against the customer pool → MUST be refused
make shop-verify-isolation ENV=dev      # expect 200 200 401 401
make verify-pool-credentials ENV=dev    # the EXTENDED version
```

Also confirm a sign-in code cannot be replayed as a password-reset code, or vice versa (FR-019).

---

## §7 — Rollback drill. ⚠ Rehearse it before you need it

```bash
# Per-surface, no infrastructure change, no redeploy:
#   revert that surface's authFlowType constant → USER_AUTH + preferredChallenge EMAIL_OTP
#   (the triggers stay attached and dormant — they only fire for CUSTOM_AUTH)
```

Verify: the surface signs in on the old flow, nobody is stranded mid-sign-in, and switching back works
(FR-033, FR-034, SC-013). ⚠ **Do this on back-office first, while it is the only migrated audience** —
that is the cheapest moment to discover rollback does not work.

---

## §8 — Sign-off

- [ ] T001 measured; values recorded in §1
- [ ] T002 / T003 recorded; design confirmed or amended **in the spec**, not patched in code
- [ ] §3 fully green, including the extended `verify-pool-credentials.sh`
- [ ] Plan showed **zero** pool/client replacements (SC-012)
- [ ] §5 walked for **all five** surfaces, on **both** mobile platforms ⚠ (SC-014 — Android has gone
      unlooked-at across three consecutive slices; that does not repeat here)
- [ ] §5 check 9 (no codes in logs) run after **every** audience
- [ ] §7 rollback drill rehearsed and reversed
- [ ] Constitution amended to **1.11.1** with dependent docs updated in the same change (FR-040)
- [ ] Audience registers updated (FR-042); D23 superseded in writing (FR-038, FR-039)
- [ ] SC-010 (5 testers) and SC-011 (screen reader + autofill, both platforms) walked
- [ ] Carry-forwards recorded: client telemetry still deferred; automated end-to-end OTP entry still
      impossible without a test inbox (research R16); customer-pool bypass status per T003

⚠ **Do not mark this feature complete on machine-verified checks alone.** Every requirement that
matters here — a code that arrives, a refusal that reads right, a latency that does not leak — is only
provable with a real inbox.
