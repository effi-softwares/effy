# Contract: Root `Makefile` command surface

The single operator entry point. Every target wraps the underlying Terraform command in
`AWS_PROFILE=ef` and operates on a chosen environment via `ENV=<env>`. `apply`/`destroy` keep
Terraform's interactive approval — **Claude never auto-applies; the operator confirms** (spec FR-015).

## Invocation

```
make <target> ENV=<dev|qa|staging|prod>
```

- `ENV` defaults to `dev` if omitted (documented; still requires the profile).
- Internally each target resolves to `cd infra/envs/$(ENV) && AWS_PROFILE=ef terraform <cmd>`.

## Targets

| Target | Expands to (conceptually) | Applies live changes? |
|---|---|---|
| `make bootstrap-init` | `cd infra/bootstrap && AWS_PROFILE=ef terraform init` | no |
| `make bootstrap-apply` | `cd infra/bootstrap && AWS_PROFILE=ef terraform apply` | **yes** (one-time, operator-run) |
| `make init ENV=` | `… terraform init` (configures S3 backend) | no |
| `make plan ENV=` | `… terraform plan -var-file=<env>.tfvars` | no (preview only) |
| `make apply ENV=` | `… terraform apply -var-file=<env>.tfvars` | **yes** (interactive approval) |
| `make destroy ENV=` | `… terraform destroy -var-file=<env>.tfvars` | **yes** (interactive approval) |
| `make output ENV=` | `… terraform output` | no |
| `make fmt` | `terraform fmt -recursive infra/` | no (writes formatting) |
| `make validate ENV=` | `… terraform validate` | no |
| `make lint` | `fmt -check` + `validate` + `tflint` + security scan (`checkov`/`trivy config`) | no |

## Example session (the intended first run)

```
make bootstrap-init
make bootstrap-apply          # creates the S3 state bucket — operator runs, once

make init  ENV=dev            # wires the S3 backend for dev
make plan  ENV=dev            # review: 4 pools + clients + SSM params to be created
make apply ENV=dev            # operator confirms → dev is live in ap-southeast-1

make plan  ENV=qa             # authored-but-unapplied: valid plan, nothing applied
```

## Guarantees

- **Profile-scoped**: no target ever runs without `AWS_PROFILE=ef` ⇒ provider **and** S3 backend use
  the `ef` credentials (FR-017/FR-018).
- **No `-auto-approve`** on `apply`/`destroy` ⇒ a human always confirms mutating actions (FR-015).
- **Plan-before-apply**: `plan` is always available and is the change preview (FR-016).
- **Env-scoped**: a target touches exactly one env root ⇒ no cross-env blast radius (FR-012).
