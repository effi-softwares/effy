# Quickstart — 011 Customer Storefront Web

The operator runbook. Per CLAUDE.md, **Claude writes the code; the operator runs everything that
touches live AWS.**

> ## ⏸ Google SSO is PARKED (2026-07-14, operator decision)
>
> The customer keeps **two credential routes**: **email + password** and **email one-time code**.
> Both are pure-SDK and need **nothing outside this repository**.
>
> Google is **built, tested and dormant** behind `customer_google_enabled = false` — the Terraform,
> the identity provider with its `email_verified` security mapping, the account-linking Lambda, the
> storefront's OAuth config and its callback all exist. It is a flag, not a deletion.
>
> **What parking it bought:**
> - the **only out-of-code dependency is gone** (no Google OAuth client to register — nothing
>   external blocks you);
> - the **two-stage apply collapses to one** (the pool needed the linking Lambda to exist first;
>   with no federation there is nothing to link);
> - **Spike A disappears** (`AliasExistsException` is a Google-linking failure mode).
>
> **⚠ To un-park it later, see § 8. The account-linking trigger MUST be wired in the same change** —
> federation without it hands an existing customer a *second* account the first time they use Google,
> and there is **no retroactive merge**.

## Prerequisites

- The dev environment applied (001, 002), the shared gateway live (004).
- ⚠ **010's operator run is still open**, and the **email-OTP route depends on it**: without the
  branded SES sender, Cognito's built-in sender caps at **~50 emails/day** from a generic AWS
  address. Fine for a dev sitting; fatal for real customers.

---

## 1. Local development (no cloud writes)

```bash
pnpm install
make core-run                        # hot path: LOCAL DOCKER (it is not deployed — by design)
make cw-dev                          # → http://localhost:3000
```

`apps/customer-web/.env.local` (git-ignored; a committed `.env` holds build-time placeholders so the
workspace can build without credentials):

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_CORE_API_BASE_URL=http://localhost:8080          # local Docker core-api
EDGE_API_BASE_URL=<ssm:/effy/dev/edge/api_endpoint>          # live dev cold path
NEXT_PUBLIC_COGNITO_USER_POOL_ID=<ssm:/effy/dev/auth/customer/user_pool_id>
NEXT_PUBLIC_COGNITO_CLIENT_ID=<ssm:/effy/dev/auth/customer/app_client_id>
NEXT_PUBLIC_COGNITO_DOMAIN=                                  # blank → Google not offered (parked)
```

Both API addresses are **configuration, never literals** (FR-029), so the hot path's eventual go-live
needs no code change here.

---

## 2. **OPERATOR** — apply the Cognito changes

**One apply. No external dependency.**

```bash
make plan ENV=dev      # READ THE PLAN
make apply ENV=dev
```

**What it changes**: the customer app client gains `ALLOW_USER_SRP_AUTH` (making the password
challenge usable), a password policy, and account recovery by verified email. The pool gains
`lifecycle { prevent_destroy = true }`.

**What it does NOT change**: driver, shop and back-office. They stay strictly passwordless,
unfederated and admin-provisioned.

> ### ⚠ ABORT if any Cognito pool shows `must be replaced` / `-/+`
>
> A replaced pool **destroys every account in it** — the 006 first admin, the 009 shop users.
>
> The change set is verified **non-destructive** against the Terraform provider schema (research
> **D13**): the only `ForceNew` arguments on `aws_cognito_user_pool` are `username_attributes`,
> `alias_attributes` and `username_configuration.case_sensitive`, and **none is touched**. So this
> should not happen — which is exactly why you should stop and investigate if it does.

Then prove the internal audiences were not collaterally widened:

```bash
make verify-pool-credentials ENV=dev
# → driver / shop / back-office: passwordless, unfederated, admin-provisioned
```

---

## 3. **OPERATOR** — the migration

```bash
git add db/migrations/20260714120000_customer.sql && git commit   # the 003 commit-guard needs this first
make db-status ENV=dev
make db-up ENV=dev
```

---

## 4. **OPERATOR** — deploy the cold-path service

```bash
make edge-deploy SERVICE=customer ENV=dev
```

This deploys `GET`/`PATCH /customer/v1/me` **and** the pre-sign-up Lambda. The Lambda is deployed but
**not wired to the pool** while Google is parked — correct, because it exists only to link *federated*
identities, and there is no federation. It costs nothing dormant.

---

## 5. **⚠ OPERATOR — Spike B.** Run this before trusting the recovery flow.

Spike A (`AliasExistsException`) is parked with Google. **Spike B is not, and it is still unresolved**
(research **D17**).

**Can a customer who has NEVER had a password set one?**

1. Register `spike-b@<your-domain>` via the **email-code** route. They now have **no password at all**.
2. Sign out. Go to `/reset-password` and ask for a reset code.
3. **Observe**: does Cognito send one, and does `confirmResetPassword` succeed?

- **If it works** → the recovery flow covers passwordless customers. Delete this spike from D17.
- **If it refuses** → the supported path is an authorized `AdminSetUserPassword` after an
  OTP-authenticated session (the same Cognito-first admin-write shape as 006/009), and
  `/reset-password` needs a companion route. **Record the outcome in `research.md` D17 either way.**

---

## 6. **OPERATOR** — sign up, for the first time

Nobody has ever created a customer account. This is that moment.

1. **Email-code route** (the default): `/sign-up` → enter an email → enter the code → you are in.
   One code, not two — registration, verification and sign-in are chained.
2. **Password route**: `/sign-up` → "I'd rather set a password".
3. **One person, one record**: register by one route, then sign in by the other with the **same
   email**. `GET /customer/v1/me` must return **exactly one** customer, with the same `id` both times
   (SC-007).

---

## 7. Verification (the SC sign-off)

```bash
make cw-test    # Vitest — units
make cw-e2e     # Playwright — SSR / SEO / auth / guest-first
make cw-gates   # the two build-failing gates: Amplify quarantine + guest bundle budget
```

**The two proofs you can run by hand**, and the ones that matter most:

```bash
# SC-004 — the content is THERE, in the raw HTML, with no JavaScript executed.
curl -s http://localhost:3000/ | grep -i "<h1"

# FR-006 — a guest downloads ZERO bytes of the auth SDK. Must print NOTHING.
cd apps/customer-web && pnpm analyze | grep -i "aws-amplify"
```

**Cross-pool refusal, both directions** (SC-012): present a **back-office** token to
`/customer/v1/me` → **401 at the gateway**; present a **customer** token to `/admin/v1/me` → **401**.
Neither service ever sees the other's token.

**The barred customer** (SC-011): set `status = 'barred'` on your test customer in the database, then
load `/account` while holding a perfectly valid, unexpired token. You must be refused.

---

## 8. Un-parking Google, later

Do all of this **in one change**. Half of it is worse than none.

1. Register a **Google OAuth client** (Google Cloud console, type "Web application"):
   - Authorized JavaScript origin: `https://<cognito-domain>`
   - Authorized redirect URI: `https://<cognito-domain>/oauth2/idpresponse`
2. Put the credentials in SSM as **SecureString**:
   ```bash
   aws ssm put-parameter --name /effy/dev/auth/customer/google_client_id     --type SecureString --value '…'
   aws ssm put-parameter --name /effy/dev/auth/customer/google_client_secret --type SecureString --value '…'
   ```
   ⚠ The secret **lands in Terraform state** (accepted — the bucket is private and encrypted). Never
   put it in a committed `.tfvars`.
3. `make apply ENV=dev` with `customer_google_enabled = true` → creates the hosted domain + the
   identity provider.
4. `make edge-deploy SERVICE=customer ENV=dev`, then set `customer_pre_sign_up_lambda_arn` to the
   deployed ARN and **apply again**. *(Two-stage is unavoidable: the pool cannot reference a Lambda
   that does not exist.)*
5. Set `NEXT_PUBLIC_COGNITO_DOMAIN` — the storefront then renders the Google button automatically.
   **No code change.**
6. **Run Spike A** (research **D17**), which you deferred by parking:
   - register `spike-a@…` by **email code**, then sign in with **Google** using the same address;
   - **does the first Google sign-in fail?** Widely reported (`AliasExistsException`), and AWS's docs
     neither confirm nor deny it.
   - `CallbackHandler.tsx` already contains a **single transparent retry** for exactly this. If the
     spike shows it does not happen, **delete the retry** — a silent retry that masks a real error is
     a liability.
7. Flip the parity register's row 7 from ⏸ to ✅, and update the E2E test that currently asserts the
   Google button is **absent**.
