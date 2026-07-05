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
│   └── ssm-parameters/     # writes the app↔infra contract values to SSM
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
  `/effy/<env>/auth/<audience>/…` and `/effy/<env>/region`; renaming a key is a breaking
  change ([contract](../specs/001-infra-foundation/contracts/ssm-parameters.contract.md)).

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
