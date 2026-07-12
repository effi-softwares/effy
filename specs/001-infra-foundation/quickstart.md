# Quickstart: Provision & Validate the Infrastructure Foundation

A run/validate guide for the **operator** (you run every apply — Claude never does). It proves the
slice end-to-end: bootstrap the remote state → apply `dev` → verify the four pools → test customer
passwordless sign-in → confirm `qa`/`staging`/`prod` are authored-but-unapplied.

> All commands assume an `ef` AWS profile configured locally with permissions for S3, Cognito, and SSM
> in the target account. Every `make` target already prefixes `AWS_PROFILE=ef`.

## Prerequisites

- Terraform **≥ 1.11** (`terraform version`), AWS CLI v2, the `ef` profile (`aws configure list-profiles`).
- The target AWS account id (goes into each `*.tfvars` as `aws_account_id`).
- Region for `dev`: `ap-southeast-2`.

## Step 0 — One-time: create the remote state bucket

```
make bootstrap-init
make bootstrap-apply        # review the plan, type "yes"
```

**Expected**: an S3 bucket `effy-…-tfstate` (versioned, encrypted, public-access-blocked). This is the
only step that uses local state.

## Step 1 — Initialize and preview `dev`

```
make init ENV=dev           # configures the S3 backend (state key envs/dev/terraform.tfstate)
make plan ENV=dev
```

**Expected plan**: creates **4** `aws_cognito_user_pool` (customer/driver/shop/back-office), their app
clients, the back-office groups (`admin`/`manager`/`csa`), and the SSM parameters. Zero errors.

## Step 2 — Apply `dev`

```
make apply ENV=dev          # review, type "yes"
```

**Expected**: all resources created in `ap-southeast-2`. `make output ENV=dev` shows the four
`user_pool_id`s and `app_client_id`s. Validates **spec SC-001** (no console steps to create pools).

## Step 3 — Verify the four pools & their rules

```
# Pools exist and are isolated (4 distinct ids)
AWS_PROFILE=ef aws cognito-idp list-user-pools --max-results 10 --region ap-southeast-2

# Customer pool allows self-signup; internal pools do not
AWS_PROFILE=ef aws cognito-idp describe-user-pool --user-pool-id <customer_pool_id> \
  --region ap-southeast-2 --query 'UserPool.AdminCreateUserConfig.AllowAdminCreateUserOnly'   # => false
AWS_PROFILE=ef aws cognito-idp describe-user-pool --user-pool-id <driver_pool_id> \
  --region ap-southeast-2 --query 'UserPool.AdminCreateUserConfig.AllowAdminCreateUserOnly'   # => true

# Back-office RBAC groups exist
AWS_PROFILE=ef aws cognito-idp list-groups --user-pool-id <back_office_pool_id> --region ap-southeast-2
#   => admin, manager, csa

# SSM contract is populated
AWS_PROFILE=ef aws ssm get-parameters-by-path --path /effy/dev/auth --recursive --region ap-southeast-2
```

**Validates**: FR-001/002/003/006/007/008, SC-003 (internal pools admin-only), SC-009 (tags — inspect
any resource), and the SSM contract (E5).

## Step 4 — Customer passwordless sign-in (the money path)

Using the customer pool's app client id (public client, choice-based `USER_AUTH` flow):

```
# Self-register a customer (allowed only on the customer pool)
AWS_PROFILE=ef aws cognito-idp sign-up --client-id <customer_client_id> \
  --username test@example.com --user-attributes Name=email,Value=test@example.com --region ap-southeast-2

# Start passwordless sign-in → choose EMAIL_OTP → an OTP is emailed (Cognito default sender in dev)
AWS_PROFILE=ef aws cognito-idp initiate-auth --client-id <customer_client_id> \
  --auth-flow USER_AUTH --auth-parameters USERNAME=test@example.com,PREFERRED_CHALLENGE=EMAIL_OTP \
  --region ap-southeast-2
# => ChallengeName: EMAIL_OTP, Session: …

# Respond with the emailed code → tokens returned, NO password anywhere
AWS_PROFILE=ef aws cognito-idp respond-to-auth-challenge --client-id <customer_client_id> \
  --challenge-name EMAIL_OTP --session <session> \
  --challenge-responses USERNAME=test@example.com,EMAIL_OTP_CODE=<code> --region ap-southeast-2
```

**Expected**: tokens (id/access/refresh) returned; no password ever set or requested. **Validates
spec SC-002 / US2** (self-register + OTP sign-in < 2 min).

**Negative check (US3 / SC-003)**: the same `sign-up` against a `driver`/`shop`/`back-office` client is
**rejected** (`NotAuthorizedException` / sign-up disabled).

## Step 5 — Confirm higher envs are authored-but-unapplied

```
make init ENV=qa
make plan ENV=qa            # valid creation plan, but DO NOT apply
make plan ENV=staging
make plan ENV=prod
```

**Expected**: each produces a clean plan with **zero** existing resources to change — proving they are
authored and ready, yet hold no live infrastructure. **Validates spec FR-011 / SC-004.**

## Step 6 — Safety checks (optional but recommended)

- **Wrong-account guard**: temporarily point `ef` at a different account (or change `aws_account_id` in
  `dev.tfvars`) and run `make plan ENV=dev` → Terraform **errors** on `allowed_account_ids` before any
  change (validates the wrong-account edge case / D8).
- **Lock**: start `make apply ENV=dev` and, while it holds, run `make plan ENV=dev` in another shell →
  the second is **blocked** by the S3 lockfile (validates FR-013 / SC-008).
- **No auto-apply**: confirm no target uses `-auto-approve`; every `apply` prompts for confirmation
  (validates FR-015 / SC-006).

## Teardown (dev only)

```
make destroy ENV=dev        # interactive approval; affects only dev's isolated state
```

---

### What this guide does **not** cover (later slices)

- Backend per-pool JWT validation and cross-pool token rejection (a backend slice).
- SES production email for qa/staging/prod OTP delivery (prerequisite when those envs are applied).
- Network / DB / compute / metrics-stack modules.
