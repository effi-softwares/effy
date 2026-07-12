# infra/envs — per-environment roots

Each subdirectory is a **self-contained Terraform root** (own backend key, provider,
variables, tfvars). Composition happens **here** — roots call `infra/modules/*`; modules
never call each other (ARCHITECTURE.md).

| Env | State key | Status |
|---|---|---|
| `dev` | `envs/dev/terraform.tfstate` | **Applied** — the only live env (`ap-southeast-2`) |
| `qa` | `envs/qa/terraform.tfstate` | Authored, **not applied** |
| `staging` | `envs/staging/terraform.tfstate` | Authored, **not applied** |
| `prod` | `envs/prod/terraform.tfstate` | Authored, **not applied** |

`_shared/` is a tiny resource-less module giving every root the same name prefix
(`effy-<env>`) and base-tag map — the single source of naming/tagging truth.

## Promoting an environment (qa → staging → prod)

The higher roots are deliberately skeletons (no pools yet). To promote:

1. Copy the composition files from `dev/` (`auth-customer.tf`, `auth-driver.tf`,
   `auth-shop.tf`, `auth-backoffice.tf`, `region.tf`, `db.tf`) into the target root.
2. Set the real `aws_account_id` in the env's `.tfvars`.
3. **Switch OTP email to SES** (`email_configuration = { email_sending_account = "DEVELOPER", … }`)
   — the Cognito default sender's ~50 emails/day cap is dev-only (research.md D6). SES domain
   verification + sandbox exit are prerequisites.
4. **Flip the database durability levers** — dev's cost floor is NOT a valid posture beyond
   dev (002 quickstart runbook): `db_backup_retention_days = 7+`, `db_deletion_protection =
   true`, `db_multi_az` per env criticality, `db_publicly_accessible = false` + explicit
   `vpc_id`/`subnet_ids` (private placement — requires the network slice), and revisit
   `db_instance_class`/storage for the real workload.
5. **🔴 CLOSE THE DEV DATABASE EXPOSURE — this is the one that bites.** See the debt note below.
   `dev` sets `db_allowed_cidrs = ["0.0.0.0/0"]`. Copying `dev.tfvars` forward without changing
   this ships a **publicly reachable production database**. It is not enough to flip
   `db_publicly_accessible = false`: the edge-api Lambdas run **outside the VPC** and reach the DB
   over its public endpoint, so making the DB private *also* requires giving them a private path
   back (in-VPC placement + interface endpoints, or RDS Proxy). The two changes must land
   together, or the API loses its database.
5. `make plan ENV=<env>` → review → the **operator** runs `make apply ENV=<env>`.

## 🔴 Known debt: the dev database is on the public internet (2026-07-12)

**Status: accepted for `dev`, must be closed before any environment holds real data.**

`dev` runs `db_allowed_cidrs = ["0.0.0.0/0"]` with `db_publicly_accessible = true` — Postgres 5432
is reachable from anywhere, defended only by forced TLS (`rds.force_ssl = 1`) and the RDS-managed
32-character master password. Public Postgres is discovered by scanners within hours and
brute-forced continuously. This is a **real exposure**, not a theoretical one.

**Why it was accepted.** The edge-api Lambdas run **outside the VPC**, so they egress from
arbitrary AWS IPs that no allowlist can pin. They are outside the VPC because an *in-VPC* Lambda
has no internet path without a NAT gateway (~$32/mo) — a public subnet does **not** help, since an
internet gateway only translates for resources with a public IP and Lambda ENIs never get one.
That forced a per-API interface endpoint (~$9/mo each): one for Secrets Manager, then 009's
runtime Cognito call needed another, and every future AWS API would need one more. Moving the
functions out of the VPC gives them ordinary egress for **$0** and deleted ~$18/mo of endpoints.
The bill for that is the public DB. dev's data is disposable (backups off; the env was destroyed
and rebuilt keeping nothing), so the blast radius is a throwaway box.

**How to close it** (its own slice — do not bolt it on):

- Put the DB in **private subnets**, `db_publicly_accessible = false`, allowlist emptied.
- Give the functions a private path back — either return them to the VPC with interface endpoints
  for every AWS API they call (Secrets Manager + Cognito today), or front the DB with RDS Proxy.
- These two must land **together**. Doing only the first takes the database away from the API.

Until then: **never point a non-dev environment at this posture**, and never put real user data in
`dev`.

## Region relocation runbook

**Executed 2026-07-12: Singapore (`ap-southeast-1`) → Sydney (`ap-southeast-2`).** The notes below are
the corrected procedure, rewritten from what the move actually required.

Region is a **single per-env variable** (`aws_region`); no module or root hardcodes it
(FR-019/FR-020, SC-007). But a "move" is not a mutation — it is a **destroy + re-provision**:

- **Cognito user pools are regional and cannot be moved in place** (research.md D7).
  Relocating an env **re-provisions** its pools in the new region: new pool ids, new issuer
  URLs, and — when real users exist — a user-migration exercise (users do not transfer).
  For pre-user environments the move is free.
- **A region flip alone does not relocate anything.** Resources already in state keep the region
  recorded there (AWS provider v6, verified 2026-07-05), so `apply` after a `.tfvars` edit will
  *not* silently move or destroy them. You must `destroy` in the old region, then `apply` in the new.
- **Order is load-bearing**: destroy runs from the **old** config. Terraform can only destroy what its
  state and provider point at, so every region/backend edit must land *after* the old region is empty
  (or on a branch you switch to afterwards). Editing first and destroying second strands the old
  resources with no state to destroy them from.
- **Region-pinned values live outside Terraform too.** Grep beyond `infra/` before you apply — see
  the checklist below.

### Does the state bucket move?

It does not *have* to: state is just an S3 object and can stay put while resources live elsewhere.
The 2026-07-12 move **did relocate it** (`effy-apse1-tfstate` → `effy-apse2-tfstate`) because the goal
was to leave `ap-southeast-1` entirely empty. If you relocate the backend:

- The bucket has `prevent_destroy = true` (bootstrap `main.tf`) — Terraform will refuse to delete it.
  Empty and delete the old bucket **out of band**, after the envs are destroyed and their state is
  worthless, then discard the local bootstrap state and re-bootstrap in the new region.
- Every `infra/envs/*/backend.tf` names the bucket **literally** (backends cannot use variables), so
  all four change together. `terraform init -reconfigure` picks up the new backend; with the envs
  already destroyed there is no state worth migrating.

### Procedure

1. **Destroy first, from the old config** — on the pre-change commit: `make destroy ENV=<env>`, plus
   `make edge-remove SERVICE=<svc> ENV=<env>` for each Serverless stack (they are CloudFormation, not
   Terraform, and are not in the Terraform state).
2. Edit the env's `.tfvars`: `aws_region = "<new-region>"`. If moving the backend, also update the
   bucket name + region in all four `backend.tf` files and in `infra/bootstrap/`.
3. **Sweep the region-pinned values Terraform never sees** — each one silently breaks in a new region:
   - `apis/edge-api/*/serverless.yml` → `provider.region` **and** the Parameters-and-Secrets extension
     **layer ARN** (the AWS-owned account id in that ARN differs per region — it is not just the
     region segment).
   - `apis/edge-api/shared/src/lib/rds-ca.ts` → the **RDS CA bundle is region-rooted**. A bundle from
     the old region fails TLS against the new region's instance. Regenerate from
     `https://truststore.pki.rds.amazonaws.com/<region>/<region>-bundle.pem`.
   - `Makefile` `AWS_REGION`, `infra/scripts/db-dsn.sh`, `apis/core-api/.env.example`.
4. `make init ENV=<env>` (`-reconfigure` if the backend moved) → `make plan ENV=<env>` → the
   **operator** runs `make apply ENV=<env>` (never Claude, never CI).
5. **Re-provision what lived only in the cloud**: DB migrations (`make db-up`), the first admin
   (`make create-first-admin`), and any Cognito accounts — a destroyed env takes all of them with it.
6. Coordinate consumers: pool ids, issuer hosts, and the gateway URL all change. Every app/backend
   reading the SSM contract picks up the new values, but anything cached — notably each web app's
   local `.env` — must be refreshed by hand.
7. If real users existed: plan a migration/re-registration path **before** step 1.
