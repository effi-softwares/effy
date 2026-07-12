# Implementation Plan: Cost-Minimized Development Database

**Branch**: `main` (spec dir `002-dev-database`) | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-dev-database/spec.md` + binding
[operator-directives.md](./operator-directives.md) (verbatim provisioning mandate).

## Summary

Provision the platform's **PostgreSQL 16** operational database in **dev** at the absolute
cost floor: one **RDS `db.t4g.micro`** instance (ARM burstable, on-demand), **20 GB gp3**,
**single-AZ**, with **every separately-billed option off** — no Performance Insights /
advanced Database Insights, no Enhanced Monitoring, no automated backups (retention 0), no
snapshot exports, no RDS Proxy, no Extended Support exposure (current engine major). Estimated
steady-state cost **≈ US$22/month** (≤ the spec's US$25 ceiling). Network: the account's
**default VPC** with a **strictly allowlisted security group** (operator CIDRs only) and
**forced TLS** — the only $0 design that satisfies FR-006 (a NAT gateway or bastion would cost
more than the database itself; the real VPC arrives in a later network slice). Master
credential is **RDS-managed in Secrets Manager** (never in Terraform state); connection
config is published to **SSM Parameter Store** under `/effy/dev/db/*`, extending the 001
app↔infra contract. Every cost-floor choice is a reversible tfvars lever with a documented
grow-later runbook. Claude authors all IaC; **the operator runs every apply**.

**Technical approach** (decisions detailed in [research.md](./research.md)):
- One new first-party module `infra/modules/rds-postgres` (instance + SG + subnet group +
  parameter group — one concern; no module calls modules), composed by the existing dev root
  in a new `db.tf` alongside root-level SSM parameter resources (the `region.tf` precedent).
- `qa`/`staging`/`prod` untouched this slice — the DB promotes later with durability levers
  flipped (backups, Multi-AZ, private placement) per the runbook.

## Technical Context

**Language/Version**: Terraform (HCL2), `required_version >= 1.11.0`; provider
`hashicorp/aws ~> 6.0` (supports `manage_master_user_password`, `database_insights_mode`,
gp3 storage, per-resource region attributes).

**Primary Dependencies**: AWS provider only — first-party modules exclusively, per
ARCHITECTURE.md. Reuses 001's `_shared` tags module, S3 state backend, Makefile workflow.

**Storage**: the feature IS storage — RDS **PostgreSQL 16** (constitution-locked engine),
20 GB **gp3**, single-AZ, encrypted at rest (default KMS key, $0). Terraform state: existing
`effy-apse2-tfstate` bucket, dev key.

**Testing**: `terraform fmt`/`validate`/`plan` + `make lint` (tflint, trivy). Live
validation is operator-run per [quickstart.md](./quickstart.md): connect via allowlist,
negative connect, cost-posture inspection commands, upgrade-lever plan preview.

**Target Platform**: AWS `ap-southeast-2` via `var.aws_region` (region stays config, 001
D7). **dev only applied**; higher envs receive the DB at promotion time.

**Project Type**: Infrastructure-as-code slice under `infra/`. No application code, no
schema/migrations (Goose migrations arrive with the first data-bearing feature slice).

**Performance Goals**: N/A for dev provisioning. Burstable baseline is acceptable by spec
(temporary slowness in dev is not a defect). Connection ceiling on 1 GiB RAM ≈ ~100
(documented for consumer slices; client-side pooling via pgx, no proxy).

**Constraints**: ≤ **US$25/month** steady-state (SC-001); **US$0** on optional add-ons
(SC-002); no console steps; operator approves every change; dev data is disposable (no RPO);
not internet-open — allowlisted CIDRs only (FR-006); every cost lever reversible via tfvars.

**Scale/Scope**: 1 new module + 1 new dev-root file (`db.tf`) + ~5 SSM parameters + tfvars
additions. One instance, one database (`effy`), one master credential.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I. Spec-Driven Development** | spec committed; plan cites constitution; gaps go back to artifacts | ✅ spec.md + operator-directives.md committed; this plan honors both; the directives file is the recorded bridge between the zero-tech spec and these choices. |
| **II. Monorepo + Shared Contracts** | single-sourced app↔infra contract | ✅ Connection config extends the **SSM contract** (`/effy/<env>/db/*`); secret ARN published, never hand-copied. No copy-paste config. |
| **III. Dual-Path Backend** | plan declares its path(s) | ✅ **N/A — neither path**; infra only. The DB is the future home of both paths' data (hot path pgx, cold path workers) — recorded so the gate is satisfied, not skipped. |
| **IV. Auth Isolation** | four pools, passwordless, no proxy | ✅ **No auth surface changes.** DB credential is a machine secret in Secrets Manager, unrelated to Cognito pools. |
| **V. Native-Feel Design** | design-system usage | ✅ **N/A** — no UI. |
| **VI. Layered Architecture & Explicit Wiring** | conform to ARCHITECTURE.md | ✅ Module + env-root layout; `rds-postgres` is one concern; modules never call modules; composition + SSM writes in the dev root; explicit inputs/outputs. |
| **VII. Observability & Telemetry** | declare telemetry for user-facing flows | ✅ No user-facing flow ships. Observability posture is deliberately the **free floor** (basic CloudWatch metrics: CPU, connections, free storage — satisfies the spec's "observe capacity at no extra cost"). Paid observability (Performance Insights etc.) is a documented promotion lever, not a dev default — justified by the spec's explicit cost mandate. |

**Technology Standards (Locked)**: PostgreSQL 16 ✅ (engine untouched by cost work);
Terraform / multi-env / remote state ✅. Goose migrations are **out of scope here** (no
schema exists yet — first consumer slice brings them). No locked technology swapped.

**Result: PASS — no violations. Complexity Tracking is empty.**

*Post-design re-check (after Phase 1): still PASS — no new violations introduced by the
data model or contracts.*

## Project Structure

### Documentation (this feature)

```text
specs/002-dev-database/
├── spec.md                  # WHAT/WHY (zero tech)
├── operator-directives.md   # binding cost mandate (plan-phase input)
├── plan.md                  # This file
├── research.md              # Phase 0 — decisions & rationale
├── data-model.md            # Phase 1 — resource/module shapes
├── quickstart.md            # Phase 1 — operator run/validate guide
├── contracts/
│   ├── rds-postgres.module.md    # reusable DB module interface
│   ├── ssm-parameters.contract.md # /effy/<env>/db/* contract additions
│   └── cost-posture.contract.md  # the all-off flag set + how to verify each
└── tasks.md                 # Phase 2 (/speckit-tasks — NOT here)
```

### Source Code (repository root)

```text
infra/
├── modules/
│   └── rds-postgres/            # NEW — one concern: one PostgreSQL instance + its plumbing
│       ├── main.tf              #   aws_db_instance + SG + db_subnet_group + parameter group
│       ├── variables.tf         #   engine ver, class, storage, cost-posture flags, cidrs…
│       ├── outputs.tf           #   endpoint, port, db name, master secret ARN, sg id
│       └── README.md
├── envs/
│   └── dev/                     # MODIFIED — composition only
│       ├── db.tf                #   NEW: module "db" + /effy/dev/db/* SSM params + outputs
│       ├── variables.tf         #   + db_* variables
│       └── dev.tfvars           #   + db values (t4g.micro / 20 gp3 / operator CIDRs)
└── (bootstrap, Makefile, qa/staging/prod — UNTOUCHED this slice)
```

**Structure Decision**: same binding "module + env-root" pattern as 001. The new module owns
exactly one concern (a PostgreSQL instance and its directly-attached plumbing). SSM contract
writes stay in the env root (`db.tf`), matching the `region.tf` precedent — the root is the
only composer. Higher-env roots are deliberately untouched; promotion copies `db.tf` and
flips durability tfvars per the runbook in [quickstart.md](./quickstart.md).

## Complexity Tracking

> No constitution violations. No entries required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | —          | —                                   |
