# Cost Evidence: 002-dev-database (SC-001 / SC-002)

**Recorded**: 2026-07-05 (plan-time half of SC-001). Region: ap-southeast-1, on-demand.

## Itemized steady-state estimate

| Item | Basis | Est. / month (USD) |
|---|---|---|
| RDS db.t4g.micro (PostgreSQL, single-AZ, on-demand) | ≈ $0.026/hr × 730 h | ≈ **$19.00** |
| gp3 storage, 20 GB | ≈ $0.126/GB-mo × 20 | ≈ **$2.53** |
| Secrets Manager — 1 RDS-managed master secret | flat | **$0.40** |
| KMS (default keys), basic CloudWatch metrics, SSM Standard params | included/free | $0.00 |
| Optional add-ons (PI, advanced Insights, Enhanced Monitoring, backups, snapshot exports, proxy, Extended Support, reserved commitments) | all OFF (see below) | **$0.00** |
| **Total** | | **≈ $21.93 ≤ $25 ceiling** (~12% headroom) |

> Operator: confirm against the [AWS Pricing Calculator](https://calculator.aws) (RDS for
> PostgreSQL, ap-southeast-1, db.t4g.micro, 20 GB gp3, single-AZ, no backup storage) and
> attach/link the estimate here at sign-off (T017).

## Static posture assertion (T010 — plan-time, 2026-07-05)

Verified in the `make plan ENV=dev` output (9 adds: instance, SG, subnet group, parameter
group, 5 SSM params — nothing else) against every row of
[contracts/cost-posture.contract.md](./contracts/cost-posture.contract.md):

| Contract row | Plan evidence | Status |
|---|---|---|
| 1 Multi-AZ | `multi_az = false` | ✓ |
| 2 Backup storage | `backup_retention_period = 0` | ✓ |
| 3 Manual snapshots | none in code; `skip_final_snapshot = true` | ✓ |
| 4 Snapshot exports | no export task resources | ✓ |
| 5 Performance Insights | `performance_insights_enabled = false` | ✓ |
| 6 Advanced Database Insights | `database_insights_mode = "standard"` | ✓ |
| 7 Enhanced Monitoring | `monitoring_interval = 0` | ✓ |
| 8 CloudWatch log exports | attribute unset | ✓ |
| 9 RDS Proxy | no resource anywhere in `infra/` | ✓ |
| 10 Extended Support | `engine_version = "16"` + auto minor upgrades | ✓ |
| 11 Reserved/committed pricing | nothing purchasable in code; live check row 11 | ✓ (live half at T011) |
| 12 Storage autoscaling | `max_allocated_storage` unset | ✓ |

Bonus posture: `storage_encrypted = true`, `manage_master_user_password = true` (no
password in state), `publicly_accessible = true` **dev-only** with `db_allowed_cidrs = []`
default (nobody) + forced TLS.

## Lever completeness audit (T013 — 2026-07-05)

Every cost-floor decision has a documented reversal path; no dead ends:

- **tfvars levers (dev root, runbook rows)**: instance size, storage (grow-only), backups,
  Multi-AZ, deletion protection, Performance Insights, private placement
  (`db_publicly_accessible` + module `vpc_id`/`subnet_ids` seam). ✓ all present in module
  variables + `db_*` passthroughs + quickstart runbook table.
- **Module-level levers (promotion adds a passthrough when first needed)**:
  `monitoring_interval` (Enhanced Monitoring), `apply_force_ssl`, `apply_immediately`,
  `engine_version`. Exposing them per-env is a two-line change; recorded in the module
  contract. ✓ acceptable.
- **Additive levers (new resources, not flips — by design)**: CloudWatch log exports
  (module edit), RDS Proxy (own resource, future slice if ever needed), snapshot exports.
  Documented in [cost-posture.contract.md](./contracts/cost-posture.contract.md) as
  promotion decisions. ✓ acceptable.

## Deferred: first-full-billing-cycle verification (SC-001 live half)

- **What**: Cost Explorer → filter tag `Project=effy`, service = RDS (+ Secrets Manager) →
  line items must be only instance-hours + gp3 storage + 1 secret; total ≤ $25.
- **When**: after the first full calendar month of running — **early September 2026**
  (August is the first full cycle for a 2026-07-05 apply).
- **Owner**: operator. Record the actual figure here when done.
