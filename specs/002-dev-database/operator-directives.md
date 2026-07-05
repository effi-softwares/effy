# Operator Provisioning Directives (plan-phase input)

**Source**: user input to `/speckit-specify`, 2026-07-05. These are **binding technical
directives for the plan phase** of `002-dev-database`. They are kept out of
[spec.md](./spec.md) to preserve the zero-tech spec discipline (constitution Principle I),
but `/speckit-plan` MUST honor them (or return here if one proves impossible).

## Verbatim mandate

> db.t4g.micro instance with 20 GB gp2 or gp3 with single AZ on demand pricing. DO NOT enable
> database insights with cloudWatch. no expert support, no backup storage and no snapshot
> exports and DO NOT TURN ON RDS proxy. i need this RDS to be cheap as possible in initial
> weeks. later we can increase resources.

## Decoded, itemized

| # | Directive | Concrete meaning |
|---|---|---|
| 1 | `db.t4g.micro` | Smallest ARM (Graviton) burstable instance class. |
| 2 | 20 GB gp2 **or gp3** | Minimum RDS allocation; prefer **gp3** (cheaper per GB than gp2 at this size, baseline 3000 IOPS included). No storage autoscaling beyond the cheap floor unless free. |
| 3 | Single AZ | `multi_az = false`; no standby. |
| 4 | On-demand pricing | No reserved instances / savings plans commitments. |
| 5 | NO Database Insights / CloudWatch extras | Database Insights **standard (free) mode only**; Performance Insights OFF; Enhanced Monitoring OFF (`monitoring_interval = 0`); no CloudWatch log exports. |
| 6 | "no expert support" | RDS **Extended Support** never billed — run a current engine version (PostgreSQL 16 per constitution) so extended support cannot trigger; disable auto minor-version surprises only if free to do so. |
| 7 | No backup storage | `backup_retention_period = 0` (automated backups OFF). Accepted-risk statement required (see spec Edge Cases / FR-010). |
| 8 | No snapshot exports | No snapshot export to S3 tasks; also skip final snapshot on destroy (`skip_final_snapshot = true`) consistent with disposable dev data. |
| 9 | NO RDS Proxy | Do not create an RDS Proxy; consumers pool client-side (pgx pool). |
| 10 | Cheap first, grow later | Every lever above must be reversible via tfvars/config — the spec's US3 runbook requirement. |

## Constitution/platform constraints that still apply

- Engine: **PostgreSQL 16** (locked technology standard — cost work does not change engine).
- Terraform module + env-root layout, dev-only apply, operator runs every apply (001 model).
- Credentials in **Secrets Manager**, connection config in **SSM Parameter Store**
  (ARCHITECTURE.md: parameter store is the app↔infra contract; secrets go to secrets).
- Standard tags via provider `default_tags` (001 `_shared` module).
- Not publicly open to the internet at large; access allowlisted (spec FR-006) — the concrete
  network design (default VPC vs minimal VPC, allowlisted ingress for the operator) is decided
  in plan under the cost mandate (beware: NAT gateways / bastions cost more than this DB).
