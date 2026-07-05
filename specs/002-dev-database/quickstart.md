# Quickstart: Provision & Validate the Dev Database

Operator guide (you run every apply — Claude never does). Proves the slice end-to-end:
apply → connect via allowlist → verify the cost posture → confirm the contract → preview a
grow-later lever. Assumes the 001 foundation is live (state bucket, dev root, Makefile).

> All `make` targets already prefix `AWS_PROFILE=ef`. Estimated steady-state cost of what
> this creates: **≈ US$22/month** (verify ≤ US$25 in the
> [AWS Pricing Calculator](https://calculator.aws) — SC-001).

## Prerequisites

- 001 applied in dev; `make plan ENV=dev` currently clean.
- **Default VPC exists** in `ap-southeast-1` (it does unless someone deleted it; remedy:
  `AWS_PROFILE=ef aws ec2 create-default-vpc --region ap-southeast-1`).
- Your public IP for the allowlist: `curl -s https://checkip.amazonaws.com`
- `psql` client locally (`brew install libpq`), for the connect test.

## Step 1 — Set your allowlist and preview

In `infra/envs/dev/dev.tfvars`, set your current IP (CIDR /32):

```hcl
db_allowed_cidrs = ["<YOUR_IP>/32"]
```

```sh
make plan ENV=dev
```

**Expected**: ~8 resources to add — 1 DB instance (`effy-dev-db`, db.t4g.micro, 20 GiB gp3,
MultiAZ false), 1 security group (ingress 5432 from your /32 only), 1 subnet group, 1
parameter group (`rds.force_ssl=1`), 5 SSM parameters. **Nothing else.**

## Step 2 — Apply (operator)

```sh
make apply ENV=dev        # review, type "yes"; RDS creation takes ~5–10 min
```

Validates **SC-003** (one approval, no console, < 30 min).

## Step 3 — Verify the cost posture (US2 / SC-002)

Run the checklist in [contracts/cost-posture.contract.md](./contracts/cost-posture.contract.md);
the two-liner version:

```sh
AWS_PROFILE=ef aws rds describe-db-instances --db-instance-identifier effy-dev-db \
  --region ap-southeast-1 --query 'DBInstances[0].{MultiAZ:MultiAZ,Backups:BackupRetentionPeriod,PI:PerformanceInsightsEnabled,Insights:DatabaseInsightsMode,Monitoring:MonitoringInterval,Logs:EnabledCloudwatchLogsExports,MaxStorage:MaxAllocatedStorage,Engine:EngineVersion,Public:PubliclyAccessible,Encrypted:StorageEncrypted}'
AWS_PROFILE=ef aws rds describe-db-proxies --region ap-southeast-1 --query 'DBProxies'   # => []
```

**Expected**: `MultiAZ:false, Backups:0, PI:false, Insights:"standard", Monitoring:0,
Logs:null, MaxStorage:null, Engine:16.x, Public:true, Encrypted:true`, proxies `[]`.

## Step 4 — Verify the contract & connect (SC-004, SC-005)

```sh
# Config from the contract — the ONLY source a consumer needs
AWS_PROFILE=ef aws ssm get-parameters-by-path --path /effy/dev/db --region ap-southeast-1 \
  --query 'Parameters[].[Name,Value]' --output table

# Fetch the secret BY THE ARN FROM SSM (never printed into files)
SECRET_ARN=$(AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/db/master_secret_arn \
  --region ap-southeast-1 --query Parameter.Value --output text)
PGPASSWORD=$(AWS_PROFILE=ef aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" \
  --region ap-southeast-1 --query SecretString --output text | python3 -c 'import sys,json;print(json.load(sys.stdin)["password"])')

# Connect using only contract values (TLS is mandatory — sslmode below is belt-and-braces)
HOST=$(AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/db/endpoint --region ap-southeast-1 --query Parameter.Value --output text)
PGPASSWORD="$PGPASSWORD" psql "host=$HOST port=5432 dbname=effy user=effy_admin sslmode=require" -c 'select version();'
```

**Expected**: `PostgreSQL 16.x on aarch64 …`.

**Negative checks**:
- From a network NOT in the allowlist (e.g. phone hotspot): the same `psql` **times out**
  (SG drops it) — SC-005.
- `psql "… sslmode=disable"` from the allowlisted network: **refused**
  (`no pg_hba.conf entry … SSL off` — forced TLS working).

## Step 5 — Preview one grow-later lever, don't apply (US3 / SC-006)

```sh
# In dev.tfvars temporarily: db_instance_class = "db.t4g.small"
make plan ENV=dev     # expect: 1 to change, in-place modify of instance class. REVERT the edit.
```

## Grow-later runbook (each lever independent; tfvars → plan → operator apply)

| Lever | tfvars change | Notes |
|---|---|---|
| Bigger instance | `db_instance_class = "db.t4g.small"` (etc.) | in-place, brief restart |
| More storage | `db_allocated_storage = 50` | **grow-only**, never shrinks |
| Backups ON | `db_backup_retention_days = 7` | ends the no-RPO risk acceptance |
| Standby | `db_multi_az = true` | ~2× instance cost |
| Delete protection | `db_deletion_protection = true` | do before real data |
| Paid observability | `db_performance_insights = true` | promotion-time |
| Private placement | `db_publicly_accessible = false` + explicit `vpc_id`/`subnet_ids` | with the network slice; qa+ REQUIRED posture |

**Accepted risk while backups are OFF (dev only)**: instance/storage failure or accidental
deletion loses all data since provisioning. Recovery = `make apply` (recreate) + re-run
schema migrations when they exist. This acceptance ends the moment non-disposable data
appears — flip backups first.

## Teardown (dev only)

```sh
make destroy ENV=dev      # interactive; removes DB (no final snapshot — by design) + pools
```

---

### Not covered here (later slices)

- Schema + Goose migrations (first data-bearing slice).
- App-scoped least-privilege DB users + consumer IAM for the secret.
- Private networking / VPC (network slice re-homes the DB via the module's override seam).
