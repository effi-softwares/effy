# Contract: Cost Posture — the all-off set and how to verify it

The operational contract behind spec **US2 / FR-005 / SC-002**: every separately-billed
option is off, and each one is verifiable with a single read-only CLI check. If any check
below drifts, that is a **contract violation** — either an accidental change (revert) or a
deliberate promotion (update this contract for that env).

All commands: `AWS_PROFILE=ef`, `--region ap-southeast-2`, `--db-instance-identifier effy-dev-db`
(via `aws rds describe-db-instances --query 'DBInstances[0].<Field>'` unless noted).

| # | Billed feature | Must read | Field / check |
|---|---|---|---|
| 1 | Standby (Multi-AZ) | `false` | `MultiAZ` |
| 2 | Automated backup storage | `0` | `BackupRetentionPeriod` |
| 3 | Manual snapshots | `[]` | `aws rds describe-db-snapshots --db-instance-identifier effy-dev-db` |
| 4 | Snapshot exports | `[]` | `aws rds describe-export-tasks` |
| 5 | Performance Insights | `false` | `PerformanceInsightsEnabled` |
| 6 | Advanced Database Insights | `standard` | `DatabaseInsightsMode` |
| 7 | Enhanced Monitoring | `0` | `MonitoringInterval` |
| 8 | CloudWatch log exports | absent/empty | `EnabledCloudwatchLogsExports` |
| 9 | RDS Proxy | `[]` | `aws rds describe-db-proxies` |
| 10 | Extended Support surcharge | engine `16.x` (in standard support) | `EngineVersion` |
| 11 | Reserved/committed pricing | none purchased | `aws rds describe-reserved-db-instances` → `[]` |
| 12 | Storage autoscaling headroom | absent/`0` | `MaxAllocatedStorage` |

**Billing-side verification (after one full cycle)**: Cost Explorer filtered by tag
`Project=effy` + service = RDS → line items must be only *instance hours* and *gp3 storage*
(plus the one Secrets Manager secret under that service). Target: total ≤ **US$25/mo**
(SC-001), expected ≈ **US$22**.

**What is deliberately ON and free**: encryption at rest (default KMS), basic CloudWatch
metrics, forced TLS, the $0.40/mo managed master secret (the single accepted paid item —
research D5 records why).

**Change law**: flipping any lever ON for an env is a promotion decision — do it via the
runbook (quickstart), update the env's tfvars, and note it here for that env. Silent drift
found by these checks is a defect.
