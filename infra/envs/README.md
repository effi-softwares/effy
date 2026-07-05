# infra/envs — per-environment roots

Each subdirectory is a **self-contained Terraform root** (own backend key, provider,
variables, tfvars). Composition happens **here** — roots call `infra/modules/*`; modules
never call each other (ARCHITECTURE.md).

| Env | State key | Status |
|---|---|---|
| `dev` | `envs/dev/terraform.tfstate` | **Applied** — the only live env (`ap-southeast-1`) |
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
5. `make plan ENV=<env>` → review → the **operator** runs `make apply ENV=<env>`.

## Region relocation runbook (e.g. `ap-southeast-1` → `ap-southeast-2`)

Region is a **single per-env variable** (`aws_region`); no module or root hardcodes it
(FR-019/FR-020, SC-007). But note what a "move" means:

- **Cognito user pools are regional and cannot be moved in place** (research.md D7).
  Relocating an env **re-provisions** its pools in the new region: new pool ids, new issuer
  URLs, and — when real users exist — a user-migration exercise (users do not transfer).
  For pre-user environments the move is free.
- **Terraform state does NOT move.** The state bucket (and each root's `backend.tf
  region`) stays in `ap-southeast-1` regardless of where resources live. Do not touch
  `backend.tf` when relocating resources.

Procedure:

1. Edit the env's `.tfvars`: `aws_region = "ap-southeast-2"`.
2. `make plan ENV=<env>` — NEW resources target the new region and region-derived values
   (e.g. `/effy/<env>/region`) update. Note (AWS provider v6, verified 2026-07-05): resources
   that already exist keep the region recorded in their state — a region flip does NOT
   silently destroy live resources. A true relocation of an applied env is therefore
   `make destroy` (old region) followed by `make apply` (new region) — i.e. re-provision,
   exactly as D7 anticipates.
3. Coordinate consumers: pool ids and issuer hosts change — every app/backend reading the
   SSM contract picks up the new values; anything cached must be refreshed.
4. The **operator** runs `make apply ENV=<env>` (never Claude, never CI).
5. If real users existed: plan a migration/re-registration path **before** step 4.
