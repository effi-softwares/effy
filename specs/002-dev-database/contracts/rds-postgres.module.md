# Contract: `modules/rds-postgres`

One concern: **one PostgreSQL instance + its directly-attached plumbing** (security group,
subnet group, parameter group). Instantiated once per env root. Never calls other modules;
the env root composes its outputs (ARCHITECTURE.md).

## Inputs (variables)

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `name_prefix` | string | yes | — | `effy-<env>`; instance is `${name_prefix}-db`. |
| `engine_version` | string | no | `"16"` | Major-pinned; minors auto-apply (D1). |
| `instance_class` | string | no | `"db.t4g.micro"` | Size lever. |
| `allocated_storage_gb` | number | no | `20` | Grow-only lever; gp3 minimum. |
| `storage_type` | string | no | `"gp3"` | `gp3` preferred (D2). |
| `db_name` | string | no | `"effy"` | Initial database. |
| `master_username` | string | no | `"effy_admin"` | Password is ALWAYS RDS-managed — no password input exists. |
| `multi_az` | bool | no | `false` | Durability lever. |
| `backup_retention_days` | number | no | `0` | `0` = automated backups OFF (dev). |
| `deletion_protection` | bool | no | `false` | Promotion lever. |
| `performance_insights_enabled` | bool | no | `false` | Paid observability lever. |
| `monitoring_interval` | number | no | `0` | `0` = Enhanced Monitoring OFF. |
| `publicly_accessible` | bool | no | `false` | Dev root passes `true` explicitly (D4) — the cautious default is private. |
| `allowed_cidrs` | list(string) | no | `[]` | SG ingress on 5432. `[]` = nobody. **Validation rejects `0.0.0.0/0` and `::/0`.** |
| `vpc_id` / `subnet_ids` | string / list(string) | no | `null` (⇒ default VPC discovery) | Override seam for the future network slice (D8). |
| `apply_force_ssl` | bool | no | `true` | Parameter group `rds.force_ssl = 1` (D7). |
| `tags` | map(string) | no | `{}` | Merged with provider default_tags. |

## Behaviour (invariants)

- **No password ever enters Terraform**: `manage_master_user_password = true` always; the
  module exposes the secret **ARN** only.
- `skip_final_snapshot = true`, no snapshot/export resources, no proxy, no CloudWatch log
  exports, `database_insights_mode = "standard"` (free) — the cost posture is baked in and
  only loosened via the explicit lever variables above.
- Storage encryption at rest always on (default KMS key).
- Ingress is deny-by-default; the module cannot express internet-open ingress.
- Default-VPC discovery only runs when `vpc_id`/`subnet_ids` are null.

## Outputs

| Name | Description |
|---|---|
| `endpoint` | Hostname (no port). |
| `port` | 5432. |
| `db_name` | `effy`. |
| `master_username` | `effy_admin`. |
| `master_secret_arn` | Secrets Manager ARN of the RDS-managed master secret. |
| `security_group_id` | For future consumer SG-to-SG rules (hot path slice). |
| `instance_arn` / `instance_id` | For tags/billing tooling. |

## Consumed by

The env root (`envs/dev/db.tf`) wires outputs into `/effy/<env>/db/*` SSM parameters and
root outputs. No other module reads them.
