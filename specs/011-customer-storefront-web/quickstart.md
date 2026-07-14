# Quickstart — 011 Customer Storefront Web

The operator runbook. Per CLAUDE.md, **Claude writes the code; the operator runs everything that
touches live AWS.** Commands below marked **OPERATOR** are yours.

## Prerequisites

- The dev environment applied (001, 002), the shared gateway live (004).
- **A Google OAuth client** — an out-of-code dependency (like the GoDaddy registrar in 010). See step 2.
- ⚠ **010's operator run is still open.** The **email-OTP route depends on it**: without the branded SES
  sender, Cognito's built-in sender caps at **~50 emails/day** from a generic AWS address. Fine for a dev
  sitting; fatal for real customers.

---

## 1. Local development (no cloud writes)

```bash
pnpm install
make core-run                      # hot path: local Docker (it is NOT deployed — by design, this slice)
pnpm --filter @effy/customer-web dev    # → http://localhost:3000
```

`apps/customer-web/.env.local`:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_CORE_API_BASE_URL=http://localhost:8080      # local Docker core-api
EDGE_API_BASE_URL=<ssm:/effy/dev/edge/api_endpoint>      # live dev cold path
NEXT_PUBLIC_COGNITO_USER_POOL_ID=<ssm:/effy/dev/auth/customer/user_pool_id>
NEXT_PUBLIC_COGNITO_CLIENT_ID=<ssm:/effy/dev/auth/customer/app_client_id>
NEXT_PUBLIC_COGNITO_DOMAIN=<the pool domain, step 3>
```

Both API addresses are **configuration, never literals** (FR-029) — so the hot path's eventual go-live
needs no code change here.

---

## 2. **OPERATOR** — register the Google OAuth client

In the Google Cloud console → *APIs & Services → Credentials → OAuth 2.0 Client ID* (type: **Web
application**):

- **Authorized JavaScript origin**: `https://<your-cognito-domain>`
- **Authorized redirect URI**: `https://<your-cognito-domain>/oauth2/idpresponse`
- **Scopes**: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`

Put the client id and secret into SSM as a **SecureString** before applying:

```bash
aws ssm put-parameter --name /effy/dev/auth/customer/google_client_id     --type SecureString --value '…'
aws ssm put-parameter --name /effy/dev/auth/customer/google_client_secret --type SecureString --value '…'
```

⚠ The secret **lands in Terraform state**. That is accepted (the state bucket is private and encrypted),
but do not paste it into a `.tfvars` file that gets committed.

---

## 3. **OPERATOR** — apply the Cognito changes

> ### ⚠ THIS IS TWO APPLIES, AND THE ORDER IS FORCED
>
> The pool must reference the linking Lambda, and **the Lambda must exist before the pool can
> reference it**. So:
>
> ```
> make apply ENV=dev                       # 1. pool + Google IdP + domain (trigger = null)
> make edge-deploy SERVICE=customer ENV=dev  # 2. creates the Lambda  (step 5 below)
> # then set customer_pre_sign_up_lambda_arn in dev.tfvars to the deployed ARN
> make apply ENV=dev                       # 3. wires the trigger
> ```
>
> **Do not test Google sign-in between steps 1 and 3.** Without the trigger, a customer who signs in
> with Google gets a **second, duplicate account** — and there is **no retroactive merge**
> (`AdminLinkProviderForUser` requires that the federated user not yet exist). You would have to
> delete the account to recover.

```bash
make plan ENV=dev      # READ THE PLAN
make apply ENV=dev
```

**What it changes**: the customer app client (adds `ALLOW_USER_SRP_AUTH`, Google as a supported IdP,
OAuth flows/scopes), a **new** Google identity provider, a **new** user-pool domain (prefix domain — no
certificate needed), a password policy, account recovery, and the **pre-sign-up linking Lambda**.

Afterwards, prove the internal audiences are untouched:

```bash
make verify-pool-credentials ENV=dev
# → driver / shop / back-office: passwordless, unfederated, admin-provisioned
```

> ### ⚠ ABORT if any Cognito pool shows `must be replaced` / `-/+`
>
> A replaced pool **destroys every account in it** — the 006 first admin and the 009 shop users included.
>
> The change set has been verified **non-destructive** against the Terraform provider schema (research
> **D13**): the only `ForceNew` arguments on `aws_cognito_user_pool` are `username_attributes`,
> `alias_attributes` and `username_configuration.case_sensitive`, and **we touch none of them**. So this
> should not happen — which is exactly why you should stop and investigate if it does.

Note: **no `sign_in_policy` change is needed.** The pool already permits `PASSWORD` as a first auth
factor (the module appends it, because the CreateUserPool API refuses to omit it), and per AWS that entry
enables both the plain-password and SRP flows.

---

## 4. **OPERATOR** — the migration

```bash
git add db/migrations/2026071xxxxxx_customer.sql && git commit   # the 003 commit-guard requires this first
make db-status ENV=dev
make db-up ENV=dev
```

---

## 5. **OPERATOR** — deploy the cold-path service

```bash
make edge-deploy SERVICE=customer ENV=dev
```

---

## 6. **⚠ OPERATOR — the two spikes. Run these BEFORE trusting the sign-in UI.**

Both are unresolved in the research and **both change the design if they fire** (research **D17**).

### Spike A — `AliasExistsException` on first Google sign-in (highest risk)

1. Register `spike-a@<your-domain>` via **email OTP** (no password). Confirm the account exists.
2. Sign out. Now sign in with **Google**, using the *same* email address.
3. **Observe**: does the first Google sign-in **fail**?

- **If it fails and a retry succeeds** → the reported Cognito limitation is real. Adopt fallback (a):
  transparently retry the redirect once on the callback. Record the result in `research.md` D17.
- **If it succeeds first time** → the rumour does not apply to our configuration. Record that too.

Either way, then verify the payoff: `GET /customer/v1/me` must return **one** customer, and the `sub` in
the Google-issued token must equal the `sub` from the OTP session. **One person, one record** (SC-007).

### Spike B — can a never-had-a-password customer set one?

Take the passwordless account from Spike A and run the **forgot-password** flow. If Cognito refuses,
the supported path is an authorized `AdminSetUserPassword` after an OTP-authenticated session — the same
Cognito-first admin-write shape as 006/009.

---

## 7. Verification (the SC sign-off)

```bash
pnpm --filter @effy/customer-web test        # Vitest — units
pnpm --filter @effy/customer-web e2e         # Playwright — SSR/SEO/auth/isolation
pnpm --filter @effy/customer-web size        # size-limit — the budget GATE (fails the build)
pnpm --filter @effy/customer-web lighthouse  # Lighthouse CI — the lab pre-filter
```

**The proof that matters most, and the one you can run by hand** (SC-004 — content present with **no**
client-side code executed):

```bash
curl -s http://localhost:3000/ | grep -i "<h1"     # the content is THERE, in the raw HTML
```

If that returns nothing, the surface has failed its central promise, no matter what the browser shows.

**And the guest-bundle promise** (SC-003 / FR-006):

```bash
# Must print NOTHING. If it prints anything, a guest is downloading the auth SDK.
pnpm --filter @effy/customer-web analyze | grep -i "aws-amplify"
```

Cross-pool refusal, both directions (SC-012): present a **back-office** token to
`/customer/v1/me` → **401 at the gateway**; present a **customer** token to `/admin/v1/me` → **401**.
Neither service ever sees the other's token.
