# modules/rds-postgres

One PostgreSQL instance + its directly-attached plumbing (security group, subnet group,
parameter group) at the **cost floor**: every separately-billed RDS option defaults OFF and
is only loosened via explicit lever variables. Built for
[specs/002-dev-database](../../../specs/002-dev-database/spec.md); full interface contract:
[rds-postgres.module.md](../../../specs/002-dev-database/contracts/rds-postgres.module.md).

## Invariants

- **No password ever enters Terraform** — `manage_master_user_password = true` always; the
  module outputs the Secrets Manager **ARN** only. There is no password input.
- **Internet-open ingress is unexpressable** — `allowed_cidrs` validation rejects
  `0.0.0.0/0`/`::/0`; the empty default means nobody connects until a CIDR is added.
- **Cost posture baked in**: backups retention 0, single-AZ, no Performance Insights /
  advanced Database Insights / Enhanced Monitoring / log exports / storage autoscaling /
  snapshot-on-destroy; engine major-pinned (16) with free auto minor upgrades so Extended
  Support can never bill. Verification checklist:
  [cost-posture.contract.md](../../../specs/002-dev-database/contracts/cost-posture.contract.md).
- **Always on (free)**: storage encryption at rest, forced TLS (`rds.force_ssl=1`), basic
  CloudWatch metrics.
- **Network seam**: `vpc_id` + `subnet_ids` null → default-VPC discovery (dev). The future
  network slice passes explicit ids to re-home the instance — no module changes.

## Example (dev cost floor)

```hcl
module "db" {
  source              = "../../modules/rds-postgres"
  name_prefix         = module.shared.name_prefix # effy-dev
  allowed_cidrs       = var.db_allowed_cidrs      # operator /32s; [] = nobody
  publicly_accessible = true                      # dev-only posture (research.md D4)
}
```

Grow-later levers (each an independent tfvars flip): `instance_class`,
`allocated_storage_gb` (grow-only), `multi_az`, `backup_retention_days`,
`deletion_protection`, `performance_insights_enabled` — runbook in
[quickstart.md](../../../specs/002-dev-database/quickstart.md).

This module never calls other modules; the env root composes its outputs into the
`/effy/<env>/db/*` SSM contract (ARCHITECTURE.md).
