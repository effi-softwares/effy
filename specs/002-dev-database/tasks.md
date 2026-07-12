---

description: "Task list for Cost-Minimized Development Database"
---

# Tasks: Cost-Minimized Development Database

**Input**: Design documents from `/specs/002-dev-database/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md),
[operator-directives.md](./operator-directives.md) (binding cost mandate),
[research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/),
[quickstart.md](./quickstart.md)

**Tests**: No test framework requested. For this IaC slice, "tests" are `terraform
fmt`/`validate`/`plan`, `make lint` (tflint + trivy), the static cost-posture assertions,
and the operator-run validations in [quickstart.md](./quickstart.md).

**Organization**: Tasks grouped by user story (US1 running-cheap-DB / US2 verifiably-off /
US3 grow-later), matching spec priorities.

**⚠️ Mode of work (CLAUDE.md)**: Claude **authors** all Terraform and runs read-only
checks (`fmt`/`validate`/`plan`/`lint`, `describe-*`). The **operator runs every apply** —
tasks marked **🧑‍💻 OPERATOR** hand off exact commands; Claude never applies.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete-task dependency)
- **[Story]**: US1 / US2 / US3 (Setup / Foundational / Polish have no label)
- Paths are repo-root-relative.

---

## Phase 1: Setup

**Purpose**: Preconditions only — nothing authored, nothing applied.

- [X] T001 Preflight (read-only): confirm the 001 foundation plans clean (`make plan ENV=dev` → no changes) and the default VPC exists (`AWS_PROFILE=ef aws ec2 describe-vpcs --filters Name=isDefault,Values=true --region ap-southeast-2` → one VPC; remedy in [quickstart.md](./quickstart.md) Prerequisites if not)

**Checkpoint**: clean baseline; network home for the DB confirmed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The reusable module every story depends on.

- [X] T002 Author `infra/modules/rds-postgres/` per [contracts/rds-postgres.module.md](./contracts/rds-postgres.module.md):
  `variables.tf` (every cost lever as an input with the cheap default — `instance_class="db.t4g.micro"`, `allocated_storage_gb=20`, `storage_type="gp3"`, `multi_az=false`, `backup_retention_days=0`, `performance_insights_enabled=false`, `monitoring_interval=0`, `deletion_protection=false`, `publicly_accessible=false`, `allowed_cidrs=[]`, `vpc_id`/`subnet_ids` null override seam, `apply_force_ssl=true`; validations: **reject `0.0.0.0/0`/`::/0` in allowed_cidrs**, storage ≥ 20);
  `main.tf` (default-VPC + default-subnet data sources gated on `vpc_id == null`; deny-by-default `aws_security_group` ingress TCP/5432 from `allowed_cidrs` only, no egress; `aws_db_subnet_group`; `aws_db_parameter_group` family `postgres16` with `rds.force_ssl=1`; `aws_db_instance`: engine postgres `"16"` + `auto_minor_version_upgrade=true`, `manage_master_user_password=true` (NO password argument anywhere), `db_name="effy"`, `username="effy_admin"`, `storage_encrypted=true`, `skip_final_snapshot=true`, `database_insights_mode="standard"`, no log exports, no `max_allocated_storage`; targeted `#trivy:ignore` comments with rationale for the documented dev decisions — public access, no backups, no Multi-AZ — mirroring the 001 KMS precedent);
  `outputs.tf` (`endpoint`, `port`, `db_name`, `master_username`, `master_secret_arn`, `security_group_id`, `instance_id`, `instance_arn`); `README.md` (invariants + example) per research.md D1–D5/D7–D8
- [X] T003 Validate the module standalone: `terraform fmt -recursive infra` + `terraform -chdir=infra/modules/rds-postgres init -backend=false` + `validate`

**Checkpoint**: module authored and validate-clean; no env wired yet.

---

## Phase 3: User Story 1 — A running development database at minimal cost (Priority: P1) 🎯 MVP

**Goal**: `effy-dev-db` live in dev from code: t4g.micro / 20 GB gp3 / single-AZ, connection
contract in SSM, secret in Secrets Manager, reachable only from the operator's allowlist.

**Independent Test**: one reviewed `make apply ENV=dev`; then `psql` succeeds using ONLY
values read from `/effy/dev/db/*` + the fetched secret; unauthorized network times out
(quickstart Steps 1–2, 4).

### Implementation for User Story 1

- [X] T004 [P] [US1] Extend `infra/envs/dev/variables.tf` with the `db_*` variable set (`db_instance_class`, `db_allocated_storage`, `db_storage_type`, `db_allowed_cidrs`, and the levers `db_multi_az`, `db_backup_retention_days`, `db_deletion_protection`, `db_performance_insights`, `db_publicly_accessible`) — defaults = the cost floor per [operator-directives.md](./operator-directives.md)
- [X] T005 [P] [US1] Extend `infra/envs/dev/dev.tfvars`: `db_instance_class = "db.t4g.micro"`, `db_allocated_storage = 20`, `db_storage_type = "gp3"`, `db_allowed_cidrs = []` (comment: operator inserts their `/32` at apply time — quickstart Step 1), `db_publicly_accessible = true` (comment: dev-only posture, research.md D4)
- [X] T006 [US1] Author `infra/envs/dev/db.tf`: `module "db"` (source `../../modules/rds-postgres`, `name_prefix = module.shared.name_prefix`, levers from `var.db_*`) + the five `aws_ssm_parameter` `String` resources `/effy/dev/db/{endpoint,port,name,master_username,master_secret_arn}` per [contracts/ssm-parameters.contract.md](./contracts/ssm-parameters.contract.md) + `output` blocks (`db_endpoint`, `db_port`, `db_name`, `db_master_secret_arn`, `db_security_group_id`)
- [X] T007 [US1] Run `make fmt` + `make validate ENV=dev` + `make lint`; then `make plan ENV=dev` (Claude runs plan — no apply): exactly the expected adds — 1 instance + 1 SG + 1 subnet group + 1 parameter group + 5 SSM params, **nothing else**
- [ ] T008 [US1] 🧑‍💻 OPERATOR: put your IP in `db_allowed_cidrs` (`curl -s https://checkip.amazonaws.com` → `["<ip>/32"]`), `make plan ENV=dev`, `make apply ENV=dev` (quickstart Steps 1–2, ~5–10 min). Acceptance: one approval, zero console steps, < 30 min (SC-003)
- [ ] T009 [US1] 🧑‍💻 OPERATOR: quickstart Step 4 — contract-only connect: SSM `/effy/dev/db/*` populated; `psql` with values read from SSM + secret fetched by ARN returns `PostgreSQL 16.x` (SC-004); `sslmode=disable` refused (forced TLS); connect from a non-allowlisted network times out (SC-005)

**Checkpoint**: the platform has a database; consumers can find it via the contract — MVP.

---

## Phase 4: User Story 2 — Zero spend on optional extras, verifiably (Priority: P2)

**Goal**: all 12 rows of the cost-posture contract provably OFF; recurring cost ≈ US$22 ≤
US$25.

**Independent Test**: every check in
[contracts/cost-posture.contract.md](./contracts/cost-posture.contract.md) passes against
the live instance; pricing evidence recorded (quickstart Step 3).

### Implementation for User Story 2

- [X] T010 [P] [US2] Static posture assertion (Claude, read-only): cross-check module defaults, `dev.tfvars`, and the T007 plan output against **all 12 rows** of [contracts/cost-posture.contract.md](./contracts/cost-posture.contract.md); any mismatch goes back to T002/T005 before apply
- [X] T011 [US2] 🧑‍💻 OPERATOR (after T008): live posture verification — quickstart Step 3 `describe-db-instances` one-liner (`MultiAZ:false, Backups:0, PI:false, Insights:standard, Monitoring:0, Logs:null, MaxStorage:null, Engine:16.x`) + `describe-db-proxies`→`[]`, `describe-db-snapshots`→`[]`, `describe-export-tasks`→`[]`, `describe-reserved-db-instances`→`[]` (SC-002)
- [X] T012 [US2] Record pricing evidence in `specs/002-dev-database/cost-evidence.md`: itemized estimate (instance ≈ $19 + gp3 20 GB ≈ $2.5 + secret $0.40 ≈ **$22/mo**) with AWS Pricing Calculator link/screenshot reference (SC-001 plan-time half); note the **deferred** first-full-billing-cycle check (Cost Explorer, tag `Project=effy`, RDS-only line items) with its due date

**Checkpoint**: the bill is provably instance-hours + storage + one secret, nothing else.

---

## Phase 5: User Story 3 — A documented grow-later path (Priority: P3)

**Goal**: every cost-floor decision has a reversal lever, and one lever is demonstrated as a
config-only change via plan preview.

**Independent Test**: lever audit finds no dead-end decision; instance-size flip previews as
in-place modify, nothing applied (quickstart Step 5 + runbook table).

### Implementation for User Story 3

- [X] T013 [P] [US3] Lever completeness audit (Claude): every all-off row in research.md D3 has (a) a module variable in `infra/modules/rds-postgres/variables.tf`, (b) a `db_*` passthrough in the dev root, and (c) a row in the quickstart Grow-later runbook table — including the promotion-only levers (private placement via `vpc_id`/`subnet_ids` seam, rotation, SES-style per-env divergence); fix any gap in the earliest artifact
- [ ] T014 [US3] 🧑‍💻 OPERATOR (after T008): quickstart Step 5 — set `db_instance_class = "db.t4g.small"` temporarily, `make plan ENV=dev` → **1 to change, in-place**, then revert the edit; nothing applied (SC-006)

**Checkpoint**: cheap start proven reversible on paper and in plan preview.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T015 [P] Update `infra/README.md` (add `rds-postgres` to the layout tree + one ground-rule line: DB posture is per-env; dev's public-allowlist stance is dev-only) and `infra/envs/README.md` (promotion section: copy `db.tf`, flip durability levers — backups/Multi-AZ/deletion-protection/private placement REQUIRED for qa+)
- [X] T016 Full gate: `make fmt` idempotent, `make lint` green across `infra/` (every trivy ignore carries its rationale comment), all five roots still `terraform validate`-clean
- [ ] T017 🧑‍💻 OPERATOR: full [quickstart.md](./quickstart.md) end-to-end sign-off against SC-001…SC-007 (SC-001's billing-cycle half explicitly deferred to the first full cycle per T012's note)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)** → **Foundational (P2)** → everything else. T002 blocks all stories.
- **US1 (Phase 3)**: needs T002–T003. T008 (apply) needs T004–T007 complete; T009 needs T008.
- **US2 (Phase 4)**: T010 (static) needs only T005–T007; T011 (live) needs T008 applied.
- **US3 (Phase 5)**: T013 (audit) needs T002 + quickstart (exists); T014 (preview) needs T008.
- **Polish (Phase 6)**: T015–T016 after authoring settles; T017 last.

### User Story Dependencies

- **US1**: independent (the backbone; its apply unblocks US2/US3 live halves).
- **US2**: static half independent after authoring; live half depends on US1's apply.
- **US3**: audit half independent after Foundational; preview half depends on US1's apply.

### Parallel Opportunities

- T004 + T005 (different files) in parallel.
- T010 + T013 (read-only audits, disjoint scopes) in parallel once authoring is done.
- T015 in parallel with T012/T013.
- Single operator session covers T008 → T009 → T011 → T014 → T017 in one sitting.

---

## Parallel Example: post-authoring audits

```bash
Task: "T010 static cost-posture assertion vs contracts/cost-posture.contract.md"
Task: "T013 lever completeness audit vs research D3 + quickstart runbook"
Task: "T015 update infra/README.md + infra/envs/README.md"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1–2: preflight + module.
2. Phase 3: wire dev, Claude plans, 🧑‍💻 operator applies + contract-connect test.
3. **STOP & VALIDATE**: a consumer-ready database exists at the cost floor — demoable MVP.

### Incremental Delivery

1. US1 → running DB via contract → **MVP demo**.
2. US2 → posture provably all-off + pricing evidence → cost demo.
3. US3 → lever audit + preview → reversibility demo.
4. Polish → docs + lint + full sign-off.

---

## Notes

- 🧑‍💻 **OPERATOR** tasks: T008, T009, T011, T014, T017 (+ any future apply). Claude stops at
  `fmt`/`validate`/`plan`/`lint` and read-only `describe-*` checks.
- The `db_allowed_cidrs = []` default means an apply with no operator edit creates a DB
  **nobody can reach** — safe-by-default; the allowlist edit is deliberate (quickstart Step 1).
- Every acceptance maps to a spec Success Criterion (SC references inline).
- Commit after each task or logical group.
