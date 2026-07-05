# infra — Terraform foundation

Infrastructure-as-code for the Effy platform: **reusable modules composed by
per-environment roots** (the binding layout from [ARCHITECTURE.md](../ARCHITECTURE.md)
§Infrastructure — no workspaces, no wrapper tool). This slice provisions the four isolated
Cognito pools (passwordless EMAIL_OTP) and the remote-state backbone.

Feature docs: [spec](../specs/001-infra-foundation/spec.md) ·
[plan](../specs/001-infra-foundation/plan.md) ·
[quickstart (operator runbook)](../specs/001-infra-foundation/quickstart.md)

## Layout

```
infra/
├── bootstrap/            # ONE-TIME, local state — creates the S3 remote-state bucket. RUN FIRST.
├── modules/
│   ├── cognito-user-pool/  # one audience's pool + app client (passwordless EMAIL_OTP)
│   ├── rds-postgres/       # one PostgreSQL instance at the cost floor (002) + SG/subnet/param groups
│   └── ssm-parameters/     # writes the auth app↔infra contract values to SSM
├── envs/
│   ├── _shared/            # naming + base tags (resource-less module)
│   ├── dev/                # APPLIED — ap-southeast-1
│   └── qa/ staging/ prod/  # authored, NOT applied
└── scripts/              # preflight.sh — account guard called by make apply/destroy
```

## Ground rules

- **Bootstrap first.** The state bucket must exist before any `make init ENV=…` — see
  [bootstrap/README.md](./bootstrap/README.md).
- **`AWS_PROFILE=ef` everywhere.** Every Makefile target pins the profile; the provider
  additionally pins `allowed_account_ids` so a wrong-account apply fails before changes.
- **The operator runs every mutation.** `bootstrap-apply` / `apply` / `destroy` are
  human-run with interactive approval — nothing is auto-applied, ever (Claude/CI stop at
  `fmt` / `validate` / `plan` / `lint`).
- **One env at a time.** State is one bucket, one key per env
  (`envs/<env>/terraform.tfstate`, S3-native lockfile — no DynamoDB).
- **Modules never call modules.** Composition happens only in env roots.
- **The SSM Parameter Store is the app↔infra contract** —
  `/effy/<env>/auth/<audience>/…`, `/effy/<env>/db/…` and `/effy/<env>/region`; renaming a
  key is a breaking change
  ([001 contract](../specs/001-infra-foundation/contracts/ssm-parameters.contract.md),
  [002 db additions](../specs/002-dev-database/contracts/ssm-parameters.contract.md)).
  Secret material never goes in parameters — the DB master password lives in Secrets
  Manager; SSM carries its ARN.
- **DB posture is per-env.** Dev's database runs the documented cost floor (public endpoint
  + operator allowlist + forced TLS, no backups — [cost
  posture](../specs/002-dev-database/contracts/cost-posture.contract.md)). That stance is
  **dev-only**: qa/staging/prod must flip the durability levers and use private placement
  at promotion (see [envs/README.md](./envs/README.md)).

## Command surface (from the repo root)

```sh
make bootstrap-init && make bootstrap-apply   # once, operator

make init  ENV=dev     # wire the S3 backend
make plan  ENV=dev     # preview (the change contract)
make apply ENV=dev     # operator-only, interactive approval
make output ENV=dev

make fmt               # format all of infra/
make validate ENV=dev  # per-root validate (no backend needed)
make lint              # fmt-check + validate all roots + tflint + trivy config
```

Full target contract:
[makefile-targets.contract.md](../specs/001-infra-foundation/contracts/makefile-targets.contract.md).
Environment model, promotion, and the region-relocation runbook:
[envs/README.md](./envs/README.md).

## Database migrations

Schema changes are **Goose migrations** under [`db/`](../db/README.md) (raw SQL,
forward-only), applied through the same root Makefile: `db-new` / `db-status` / `db-up` /
`db-down` (dev-only). The DSN is composed at invocation from the SSM contract + Secrets
Manager by [`scripts/db-dsn.sh`](./scripts/db-dsn.sh) — nothing to configure, nothing
secret on disk. Prerequisite: your IP on the dev DB allowlist (`db_allowed_cidrs`).
Guide + runbook: [db/README.md](../db/README.md); contract:
[makefile-db-targets.contract.md](../specs/003-db-migrations/contracts/makefile-db-targets.contract.md).
