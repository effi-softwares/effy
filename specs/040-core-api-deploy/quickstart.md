# Quickstart / Operator Runbook: Core-API Cloud Deployment (dev)

Bring the hot path live at **`https://core-api.dev.effyshopping.com`** at the cheapest posture, then
roll a new version. **Claude authors all code; every step below is operator-run** (it provisions or
mutates live AWS). Commands assume repo root, the `ef` AWS profile, `ENV=dev`, region `ap-southeast-2`.

> Recurring dev cost of this slice: **~$30/mo** (ALB ~$20 + Fargate 0.25vCPU/0.5GB ARM ~$9 + ECR/logs
> ~$1–2). No NAT, no autoscaling, no second task, no new cert/secret/DB. Re-confirm from the plan output
> in step 2.

## 0. Prechecks

```bash
# Right account + a default VPC exists (the module uses it; absence fails loudly).
aws sts get-caller-identity --profile ef
aws ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text --profile ef --region ap-southeast-2   # not "None"

# The reused contract is present (fail = provision the owning slice first).
aws ssm get-parameter --name /effy/dev/db/master_secret_arn --profile ef --region ap-southeast-2 >/dev/null && echo db-ok
aws ssm get-parameter --name /effy/dev/media/bucket        --profile ef --region ap-southeast-2 >/dev/null && echo media-ok
aws secretsmanager describe-secret --secret-id /effy/dev/stripe/secret_key    --profile ef --region ap-southeast-2 >/dev/null && echo stripe-ok
# The env's wildcard cert + zone already exist (010). Confirm the zone resolves:
dig +short core-api.dev.effyshopping.com     # empty until step 3 — that's expected pre-apply
```

## 1. App change verification (built by Claude, verify locally — no AWS)

```bash
make core-test ENV=dev          # includes the DSN-from-parts unit test (parts→DSN == db-dsn.sh shape;
                                # DB_DSN overrides parts; missing part errors)
make core-run ENV=dev           # local path still works on DB_DSN (nothing local changed)
```

## 2. Apply the infrastructure (creates ECR, ALB, service, IAM, DNS — service not yet healthy)

```bash
cd infra/envs/dev
terraform init
terraform plan -out core-api.plan      # ── THE US3 COST AUDIT ──
# Confirm in the plan: exactly ONE ecs_service (desired_count 1); NO aws_appautoscaling_*;
# NO aws_nat_gateway / aws_eip(nat) / aws_vpc_endpoint; NO new aws_acm_certificate;
# NO new aws_secretsmanager_secret; NO aws_db_instance. Then:
terraform apply core-api.plan
```

`wait_for_steady_state = false`, so apply returns even though the service has **no image yet** — the
task will fail to start until step 3. That is expected.

## 3. Build, push the ARM64 image, and roll the first deployment

```bash
make core-ecr-login ENV=dev             # docker login to the new ECR repo
make core-image-push ENV=dev TAG=latest # buildx --platform linux/arm64 → tag → push (FR-015)
make core-deploy ENV=dev                # aws ecs update-service --force-new-deployment
# Watch it converge:
aws ecs wait services-stable --cluster effy-dev-core-api --services effy-dev-core-api \
  --profile ef --region ap-southeast-2
dig +short core-api.dev.effyshopping.com   # now resolves to the ALB
```

## 4. Acceptance walk (maps to Success Criteria)

```bash
BASE=https://core-api.dev.effyshopping.com

# SC-001: trusted TLS + healthy backend
curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' $BASE/healthz     # 200 0
curl -sS $BASE/readyz                                                            # dependencies reachable

# SC-002: a representative customer read returns real data (e.g. storefront home)
curl -sS "$BASE/v1/storefront/home" | head -c 300

# SC-007: HTTP is redirected, never served in cleartext
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' http://core-api.dev.effyshopping.com/healthz  # 301 https://…

# SC-010: certificate does not answer for an uncovered host; long request not severed
curl -sS -o /dev/null -w '%{http_code}\n' --resolve wrong.example.com:443:$(dig +short core-api.dev.effyshopping.com|tail -1) https://wrong.example.com/healthz || echo "refused (expected)"
```

- **SC-006 (health-gated rotation)**: force the task unhealthy (e.g. `aws ecs exec` and stop the
  listener, or set the health path to a 404 temporarily) → confirm the target deregisters and the ALB
  returns 503, then restore → traffic resumes. Observe in the target group's health, not by inference.
  **Expected worst-case eviction ≈ 120 s** = health-check `interval 30 s × unhealthy_threshold 3` (90 s
  to mark unhealthy) + `deregistration_delay 30 s`. That is the bounded interval FR-008/SC-006 name.
- **SC-008 (no secrets)**: sweep the image and logs —
  ```bash
  docker run --rm --entrypoint / <repo>:latest true 2>/dev/null || true   # distroless: no shell to leak into
  aws logs tail /ecs/effy-dev-core-api --since 1h --profile ef --region ap-southeast-2 \
    | grep -Ei 'password=|sk_(live|test)_|whsec_|BEGIN|AKIA' && echo "LEAK" || echo "clean"
  ```
- **SC-004 (cost audit)**: `terraform state list | grep -E 'appautoscaling|nat_gateway|vpc_endpoint|acm_certificate'` → **empty**; exactly one `aws_ecs_service`.
- **SC-005**: record the ~$30/mo figure (and the audit result) in the sign-off.

## 5. Roll a subsequent version (SC-009)

```bash
make core-image-push ENV=dev TAG=latest   # (prod: TAG=<git-sha>)
make core-deploy ENV=dev                  # force-new-deployment; circuit breaker rolls back if it fails health
aws ecs wait services-stable --cluster effy-dev-core-api --services effy-dev-core-api --profile ef --region ap-southeast-2
```

A version that fails its health check does **not** become the serving state — ECS marks the deployment
failed and rolls back to the previous task definition (verify by pushing a deliberately broken image
once, observing the rollback, then restoring).

## 6. Point clients at it

```bash
aws ssm get-parameter --name /effy/dev/core-api/base_url --profile ef --region ap-southeast-2 \
  --query Parameter.Value --output text        # https://core-api.dev.effyshopping.com
```

Set the customer-web hot-path base URL and the customer-mobile `CORE_API_BASE_URL` from this key. This
is what unblocks every "not walked live" customer-facing item that depended on the hot path.

## Teardown

```bash
cd infra/envs/dev && terraform destroy   # removes the module's resources; the reused DB/cert/zone/secrets are owned elsewhere and remain
```

## Production (NOT this slice — dependency checklist)

Before `core-api.effyshopping.com`: an **apex-level** DNS record + a cert covering it (owned by the
prod/global root, not the child wildcard); the task on **private** subnets (`assign_public_ip=false`)
with a **NAT gateway or interface endpoints**; a **private** DB (`db_publicly_accessible=false`); an
**immutable git-sha** image tag; and DB backups on. See `infra/envs/README.md` promotion checklist and
data-model.md § Production delta.
