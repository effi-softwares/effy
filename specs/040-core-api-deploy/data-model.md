# Data Model: Core-API Cloud Deployment (040)

This slice adds **no database schema and no migration**. The "data model" here is the **infrastructure
resource inventory**, the **runtime configuration/secret contract** the container consumes, the **IAM**
that backs it, and the **production delta**. It is the concrete backing for the spec's Key Entities.

## 1. Resource inventory (what the slice creates, dev)

Grouped by the module that owns them. **Every row is the cheapest option meeting an FR** (US3 audit).

### `infra/modules/ecs-fargate-web-service` (NEW)

| Resource | Key settings (dev) | Why cheapest / why |
|---|---|---|
| `aws_ecs_cluster` | `${prefix}-core-api`; Container Insights **OFF** | Insights is a paid CloudWatch feature; off by default. |
| `aws_ecs_task_definition` | Fargate; **256 CPU / 512 MB**; `runtime_platform` = **ARM64**/LINUX; one container `core-api` port 8080 | Smallest Fargate size; ARM ~20% cheaper (R1). |
| `aws_ecs_service` | `desired_count = 1`; **no autoscaling**; `min 0 / max 100`; circuit breaker + rollback; `assign_public_ip = true`; `wait_for_steady_state = false`; `enable_execute_command = true` | Single task, never two; auto-revert on bad deploy (R8). |
| `aws_lb` (application, **internet-facing**) | 2 public subnets/2 AZs; `idle_timeout = 120` | The retained front door; 2 AZs is an ALB requirement, not a 2nd task (R2). |
| `aws_lb_target_group` | `target_type = ip`; health `/healthz`; matcher 200; interval 30 s; 3/3; timeout 5 s; deregistration delay 30 s | `ip` required for awsvpc; liveness gate (R9). |
| `aws_lb_listener` HTTPS 443 | cert = env wildcard ARN; policy `ELBSecurityPolicy-TLS13-1-2-2021-06`; forward → TG | Reuses existing cert; no new ACM (R2). |
| `aws_lb_listener` HTTP 80 | fixed-response **301 → HTTPS** | FR-004 (no cleartext API). |
| `aws_security_group` ALB | ingress 80+443 from `0.0.0.0/0`; egress all | Public front door. |
| `aws_security_group` task | ingress **8080 from the ALB SG only**; egress all | App port never public (FR-019). |
| `aws_ecr_repository` | `${prefix}-core-api`; scan-on-push; lifecycle: keep last 10, expire untagged 1 d | Storage thrift (R7). |
| `aws_cloudwatch_log_group` | `/ecs/${prefix}-core-api`; **retention 7 d** | Short retention = cheap (R7). |
| `aws_iam_role` execution | `AmazonECSTaskExecutionRolePolicy` + inline (secrets + kms) | ECS start-time pulls (R6). |
| `aws_iam_role` task | inline `s3:GetObject` on media bucket | Presign reads (R6). |
| `aws_route53_record` A + AAAA | alias → ALB dns_name/zone_id; `evaluate_target_health = true` | Stable branded address (R4). |

### `infra/envs/dev/core-api.tf` (NEW — thin wrapper)

| Resource | Purpose |
|---|---|
| `module "core_api"` | Instantiates the module, wiring: `module.dns.certificate_arn` + `.zone_id` + `.zone_name`; the DB master-secret ARN (from the `/effy/<env>/db/master_secret_arn` param or `module.db`); Stripe secret ARNs; `aws_ssm_parameter.media_bucket` value; the customer pool id + web/mobile client ids; `var.core_api_cors_origins`; default-VPC public subnets. |
| `aws_ssm_parameter.core_api_base_url` | Publishes `/effy/<env>/core-api/base_url = https://core-api.<namespace>` for clients (Principle II). |

### NOT created (the cost audit's negative space — SC-004)

- **No** `aws_appautoscaling_target` / `_policy` (no autoscaling).
- **No** `aws_nat_gateway`, `aws_eip` for NAT, `aws_vpc_endpoint`, or private subnets.
- **No** new `aws_acm_certificate` (reuses the wildcard).
- **No** new `aws_secretsmanager_secret` (reuses RDS + Stripe secrets).
- **No** `aws_db_instance` / schema / migration; **no** second task; **no** CloudFront.

## 2. Runtime configuration/secret contract (what the container reads)

The container's environment, split by sensitivity. **Non-secret → `environment` (plaintext task-def
OK). Secret → `secrets` (`valueFrom`, resolved at start by the execution role).** All values are
resolved by Terraform from this root's own resources / the existing `/effy/<env>/*` contract — never
literals.

| Var | Delivery | Source | Secret? |
|---|---|---|---|
| `EFFY_ENV` | environment | `var.env` | no |
| `PORT` | environment | `"8080"` | no |
| `AWS_REGION` | environment | `var.aws_region` | no |
| `LOG_LEVEL` | environment | `"info"` (var) | no |
| `CORS_ALLOWED_ORIGINS` | environment | `var.core_api_cors_origins` | no |
| `AWS_MEDIA_BUCKET` | environment | `aws_ssm_parameter.media_bucket.value` | no |
| `AUTH_CUSTOMER_POOL_ID` | environment | cognito customer pool id (this root) | no |
| `AUTH_CUSTOMER_CLIENT_ID` | environment | `"<web>,<mobile>"` client ids (this root) | no |
| `DB_HOST` | environment | `/effy/<env>/db/endpoint` | no |
| `DB_PORT` | environment | `/effy/<env>/db/port` | no |
| `DB_NAME` | environment | `/effy/<env>/db/name` | no |
| `DB_USER` | environment | `/effy/<env>/db/master_username` | no |
| `DB_PASSWORD` | **secrets** | RDS master secret ARN, JSON key `:password::` | **yes** |
| `STRIPE_SECRET_KEY` | **secrets** | `/effy/<env>/stripe/secret_key` (Secrets Manager) | **yes** |
| `STRIPE_WEBHOOK_SECRET` | **secrets** | `/effy/<env>/stripe/webhook_secret` (Secrets Manager) | **yes** |

**`DB_DSN` is intentionally absent in the cloud.** The app composes the DSN from `DB_HOST/PORT/NAME/USER`
+ the injected `DB_PASSWORD` into the same libpq keyword form `db-dsn.sh` builds
(`host=… port=… dbname=… user=… password=… sslmode=require connect_timeout=10`). If `DB_DSN` **is** set
(the local `make core-run` path), it wins unchanged — so nothing local changes.

### Application change (the only one) — DSN-from-parts loader

- **Rule**: if `DB_DSN` is non-empty, use it verbatim (local path). Otherwise, require
  `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` and compose the keyword DSN; a missing part **fails
  loudly at start-up** (the task never goes healthy — never a silent wrong connection).
- **Not secret-logging**: the composed DSN and `DB_PASSWORD` are never logged (existing secret
  discipline; a redaction test guards it).
- **Test**: a unit test asserts parts→DSN equals the `db-dsn.sh` keyword shape, that `DB_DSN` overrides
  parts when both are present, and that a missing part errors.

## 3. IAM (least privilege)

| Role | Trust | Permissions |
|---|---|---|
| Execution role | `ecs-tasks.amazonaws.com` | `AmazonECSTaskExecutionRolePolicy` (ECR pull + Logs); inline `secretsmanager:GetSecretValue` on **exactly** the 3 secret ARNs; `kms:Decrypt` on the secrets' KMS key. |
| Task role | `ecs-tasks.amazonaws.com` | inline `s3:GetObject` on `arn:aws:s3:::<prefix>-product-media/*`. |

No wildcards on secret access; no permission the running code doesn't call.

## 4. State machine — deployment/health lifecycle

```
push image ──▶ force-new-deployment ──▶ task PROVISIONING ──▶ RUNNING
                                                              │
                                        ALB health /healthz ──┤
                                          200 (3×) ──▶ HEALTHY ──▶ receives traffic
                                          fail (3×) ──▶ UNHEALTHY ──▶ drained from TG
                                                              │
   new version fails health (grace elapsed) ──▶ circuit breaker ──▶ ROLLBACK to last good task def
   instance crash (single task) ──▶ brief GAP ──▶ ECS relaunches ──▶ re-health ──▶ traffic resumes
```

Accepted, documented consequences (cost trade): the **GAP** on deploy/crash, and full unavailability if
a deploy fails with no prior good version (mitigated by the circuit breaker once a good version exists).

## 5. Production delta (NOT built here — recorded so promotion is a known change, not a surprise)

Production instantiates the **same module** with different inputs; these are the deltas that are **more
than config** and belong to the production bring-up action:

| Concern | Dev (this slice) | Production (dependency) |
|---|---|---|
| Hostname | `core-api.dev.effyshopping.com` (child zone) | `core-api.effyshopping.com` — **apex-level**; needs an apex record + a cert covering it (`*.effyshopping.com` or a SAN), owned by the prod/global root, **not** the child wildcard. |
| Network | default VPC public subnets, **public IP, no NAT** | **private** subnets, `assign_public_ip = false`, a **NAT gateway or interface endpoints** for egress — a real added cost. |
| Database | public endpoint, `0.0.0.0/0` + TLS | `db_publicly_accessible = false`, private path (in-VPC + endpoints or RDS Proxy). |
| Image tag | `latest` (mutable) | **immutable git-sha** tag (known rollback artifact). |
| Rollout | `min 0 / max 100` (brief gap accepted) | operator may choose `min 100 / max 200` for zero-downtime (costs a transient 2nd task) — a per-env choice, still no autoscaling. |
| DB backups | off (disposable dev) | at least automated backups / PITR before real customer data. |

These are the module's existing inputs (subnets, `assign_public_ip`, hostname, cert ARN, secret ARNs,
image tag, rollout percents) — so prod is the **same templates** with prod values, plus the apex
cert/record and private-DB work that live in the prod root by nature.
