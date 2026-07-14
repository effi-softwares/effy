# Quickstart: Customer Profile Management (012)

**Audience**: the operator (you). Claude writes the code; **every step here that touches live AWS is yours to run.**

---

## ⚠ Read this first — the two spikes come BEFORE the code

**S1 and S2 can change the design.** They are 011's open spikes (T053, T052), now sharpened, and the honest position
is that this slice is **designed against documentation, not against evidence**, until they pass.

Do not let anyone (including me) start building the set-password flow before **Spike 1** returns green.

### Spike 1 (S1) — can a passwordless customer set a first password?

The documentation says yes, in two places. Our pool has never been asked.

```bash
# A customer who signed up via EMAIL OTP and has NEVER had a password.
# Get their ACCESS token (not the id token), then:

aws cognito-idp change-password \
  --access-token "$ACCESS_TOKEN" \
  --proposed-password 'a-fresh-twelve-char-password' \
  --region ap-southeast-2
# NOTE: --previous-password is deliberately ABSENT.
```

- **Expected**: success. Then confirm **both** routes still sign in — the new password **and** an emailed code
  (FR-026 / SC-007). Setting a password must **add** a way in, never remove one.
- **If it fails**: the whole set-password mechanism changes and FR-017's flow must be re-planned around a
  recovery-style path. **Stop and re-plan — do not improvise.**

### Spike 2 (S2) — what happens today when a passwordless customer clicks "Forgot password?"

**This path is live right now.** A real customer can hit it, and nobody knows what it does.

```bash
aws cognito-idp forgot-password \
  --client-id "$CUSTOMER_APP_CLIENT_ID" \
  --username 'otp-only-customer@example.com' \
  --region ap-southeast-2
```

- **Expected**: a code is sent (their email is verified, so they are eligible for recovery).
- **Watch for**: `InvalidParameterException` / `NotAuthorizedException` → the recovery route in FR-022b cannot be
  built as designed, and a passwordless customer currently hits a dead end on a **live page**.

### Spike 3 (S4) — does a forced token refresh inside a Server Action rewrite the cookie?

Cheap to test locally, and FR-008 depends on it: change your name, then check the **header greeting** without
signing out. If it still shows the old name, take the R11 fallback (header reads the record, at the cost of a
backend call per signed-in render).

---

## Sequence — the order is load-bearing

```
 0. Spikes 1 + 2                      ← BEFORE any code is trusted
 1. make apply ENV=dev                ← password policy 8 → 12, composition rules OFF
 2. commit the migration, make db-up ENV=dev
 3. make edge-deploy SERVICE=customer ENV=dev
 4. SES sending must work             ← 010 dependency. Without it, set-password DOES NOT WORK.
 5. Live sign-off (SC-001 … SC-014)
```

### 1. Terraform — the password policy

```bash
make plan ENV=dev     # READ IT.
make apply ENV=dev
```

⚠ **`password_policy` is an in-place update** (not ForceNew) and the pool carries `prevent_destroy`. **If the plan
shows the customer pool being replaced (`-/+` or "must be replaced"), ABORT.** A replaced pool destroys every
account on the platform — every customer, the 006 first admin, the 009 shop users.

What changes: `minimum_length 8 → 12`; `require_lowercase/uppercase/numbers → false`. That is a **loosening toward
current NIST guidance** (composition rules are now considered harmful), and the strength it gives up is picked up by
the breach screening the pool cannot do (research R8).

### 2. Migration

```bash
git add db/migrations/20260714__customer_password_state.sql && git commit   # the 003 commit-guard
make db-status ENV=dev
make db-up ENV=dev
```

### 3. Deploy the service

```bash
make edge-deploy SERVICE=customer ENV=dev
```

### 4. Email must actually send — **the hard dependency**

FR-017's step-up code and FR-025's notification both need working transactional mail. **010's SES operator steps are
still open.** Until mail sends:

- **`mode: "set"` cannot work at all** — the customer never receives the code.
- The change-notification silently does not arrive, which is the one control that catches a *successful* silent
  takeover.

Verify before sign-off:

```bash
make mail-verify ENV=dev     # 010
```

---

## The proofs that matter

Everything else in this slice can be signed off by looking at it. **These two cannot**, and they are the reason the
slice exists. Run them **adversarially** — try to break in, and fail.

### SC-004 — a session alone MUST NOT be able to set a password

The scenario is real: a borrowed phone, a shared laptop, a shoulder-surfed tab.

1. Sign in as an **OTP-only** customer (no password ever set). Copy the session cookies — you are now "the attacker
   holding a valid session".
2. From that session, drive the set-password flow **but do not open the mailbox**.
3. Attempt `PUT /customer/v1/password` with `mode: "set"` and a **guessed / absent / expired / already-used** code.

**PASS = every attempt is refused.** The password is never set. A valid session, without the inbox, buys **nothing**.

Also try the obvious bypasses — each MUST fail:

- `mode: "set"` on an account that **has** a password → `409`.
- `mode: "change"` on an account that has **none** → `409`.
- A **sign-in** OTP replayed as the step-up code → refused (they are different code types; FR-018).
- A victim's ID token paired with **your own** access token → `401` on the `sub` mismatch (research R12).

### SC-005 — no current password, no change

Holding a valid session, call `mode: "change"` with a wrong `currentPassword`. **PASS = refused**, and the error
names the field (FR-027) without leaking anything else.

### SC-006 — revocation, honestly measured

After a successful password change: confirm every other device is signed out. Then **measure the residual window** —
a revoked session's ID token is **still accepted by the API Gateway JWT authorizer until it expires** (research R7).
On the current pool config that is **up to 60 minutes**.

**Record the measured number.** FR-024a demands it be *stated*, not assumed to be zero — and a product that claims
"signed out everywhere, instantly" while a token keeps working for an hour is lying to its customers.

### SC-011 — the guest still pays nothing

```bash
pnpm --filter @effy/customer-web size        # the 160 KB guest budget
pnpm --filter @effy/customer-web depcruise   # the Amplify quarantine
```

Both **MUST** be green. If `depcruise` fails, the auth SDK has reached a guest path — almost certainly through a
component, which is exactly the leak 011's `reachable: true` rule was hardened to catch after it missed one.

**Break the guard on purpose once** (011's lesson D11: *break a guard the way it will actually break*): import
`aws-amplify` into a component the account page uses, confirm `depcruise` fails, then revert. A guard nobody has
seen fail is a guard nobody knows works.

### SC-010 — the avatar, against real names

Not just "JM". Test: one word · **no name at all** · a non-Latin script · an emoji · a name with a combining mark.
**PASS = zero blank circles, zero mangled glyphs, and no letter ever guessed from the email address.**

---

## Sign-off

- [ ] Spikes 1 + 2 green (or the design re-planned against what they actually returned)
- [ ] SC-001 … SC-014, live
- [ ] **`docs/audiences/customer-capabilities.md` corrected** — row 10 currently claims sign-out is delivered on
      `customer-web`. **It was never built.** This slice makes the claim true; the register must stop asserting it
      before it is (SC-014). A parity register that overstates is worse than none: it is a lie the team trusts.
- [ ] New rows added for: initials avatar · name edit · set password · change password · sign out · sign out
      everywhere — each with its **mobile** cell stated (outstanding, by design) rather than left blank.
