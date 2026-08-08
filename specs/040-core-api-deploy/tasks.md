---

description: "Task list for 040-core-api-deploy"
---

# Tasks: Core-API Cloud Deployment (Cheapest Fargate + ALB)

**Input**: Design documents from `specs/040-core-api-deploy/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: This is an infrastructure/delivery slice. The only unit test is for the one application
change (DSN-from-parts); everything else is proven by `terraform validate`/`plan` review and the live
acceptance walk in quickstart.md. No broad TDD suite is generated (none was requested and none fits IaC).

**Organization**: Tasks are grouped by the six user stories. Because this is one Terraform module +
one env wrapper, several stories necessarily touch the same files — those tasks are sequential (not
`[P]`). Independence is expressed at the **acceptance** level: each story has its own live proof.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US6 (maps to spec.md). Setup/Foundational/Polish carry no story label.
- ⚙️ **OPERATOR** marks a live-AWS step Claude does NOT run — handed off with exact commands (mode of work).

## Path Conventions

- Terraform module: `infra/modules/ecs-fargate-web-service/`
- Env wrapper: `infra/envs/dev/core-api.tf` (+ additions to `infra/envs/dev/variables.tf`)
- App change: `apis/core-api/` (config loader + test)
- Deploy tooling: repo-root `Makefile`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The one app change that lets the container be configured secret-safely, and the module skeleton.

- [X] T001 [P] Add the DSN-from-parts loader to core-api's config/composition root (`apis/core-api/cmd/core-api/main.go` or a new `apis/core-api/internal/platform/config/dsn.go`): if `DB_DSN` is set use it verbatim; else require `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` and compose the libpq keyword DSN `host=… port=… dbname=… user=… password=… sslmode=require connect_timeout=10`; a missing part MUST fail loudly at start-up. Never log `DB_DSN`, `DB_PASSWORD`, or the composed string.
- [X] T002 [P] Unit test for T001 in `apis/core-api/internal/platform/config/dsn_test.go`: parts→DSN equals the shape produced by `infra/scripts/db-dsn.sh`; `DB_DSN` overrides parts when both present; a missing part errors; the composed DSN/password is not emitted by the logger path.
- [X] T003 Verify the local loop is unchanged: `make core-test ENV=dev` and `make core-run ENV=dev` still work on `DB_DSN` (do NOT edit `apis/core-api/docker-compose.yml` or the Makefile `core-run` env composition).
- [X] T004 [P] Confirm the container builds for arm64: `docker buildx build --platform linux/arm64 --target runtime apis/core-api` succeeds and yields a distroless image (FR-015). No Dockerfile change expected (it is already `TARGETARCH`-aware).
- [X] T005 Scaffold the module directory `infra/modules/ecs-fargate-web-service/` with `versions.tf` (terraform `>= 1.11`, aws `~> 6.0`) and empty `variables.tf` / `outputs.tf` / `main.tf` / `iam.tf` / `ecr.tf` / `logs.tf` / `dns.tf`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared substrate every story's resources attach to. **No user-story resource can be created until this is done.**

**⚠️ CRITICAL**: Blocks Phase 3+.

- [X] T006 In `infra/modules/ecs-fargate-web-service/main.tf`, resolve networking via data sources: default VPC (`data "aws_vpc" "default" { default = true }`) and its public subnets (`data "aws_subnets"`), overridable by `var.subnet_ids`; fail loudly if no default VPC exists (research R3).
- [X] T007 [P] Security groups in `main.tf`: ALB SG (ingress 80+443 from `0.0.0.0/0`, egress all) and task SG (ingress `var.container_port` from the ALB SG **only**, egress all — so the app port is never public, FR-019).
- [X] T008 [P] CloudWatch log group in `infra/modules/ecs-fargate-web-service/logs.tf`: `/ecs/${var.name_prefix}-core-api`, `retention_in_days = var.log_retention` (default 7).
- [X] T009 [P] IAM role skeletons in `infra/modules/ecs-fargate-web-service/iam.tf`: execution role (trust `ecs-tasks.amazonaws.com` + attach `AmazonECSTaskExecutionRolePolicy`) and task role (trust only for now). Scoped secret/kms (US5) and S3 (US5) policies are added in their phases.
- [X] T010 Full input surface in `infra/modules/ecs-fargate-web-service/variables.tf`: `env`, `name_prefix`, `aws_region`, `subnet_ids`, `assign_public_ip`, `cpu`, `memory`, `container_port`, `health_check_path`, `image_tag`, `certificate_arn`, `zone_id`, `hostname`, `environment` (map), `secrets` (map of name→valueFrom ARN), `task_role_s3_bucket_arn`, `desired_count`, `min_healthy_percent`, `max_percent`, `idle_timeout`, `log_retention`. Every one documented; no literal that should be config.

**Checkpoint**: Substrate ready — the service, ALB, IAM detail, ECR and DNS can now be built.

---

## Phase 3: User Story 1 - Reachable, branded, trusted HTTPS address (Priority: P1) 🎯 MVP

**Goal**: The hot path runs in the cloud behind an internet-facing ALB at `core-api.dev.effyshopping.com` with a valid wildcard-cert TLS handshake and answers requests.

**Independent Test**: `curl https://core-api.dev.effyshopping.com/healthz` → `200` over a publicly-trusted cert for that exact host; `/v1/storefront/home` returns real data once secrets (US5) are present.

- [X] T011 [US1] ECS cluster in `infra/modules/ecs-fargate-web-service/main.tf` (`${name_prefix}-core-api`, Container Insights OFF — paid feature).
- [X] T012 [US1] Task definition in `main.tf`: Fargate, `cpu = var.cpu` (256) / `memory = var.memory` (512), `runtime_platform { cpu_architecture = "ARM64", operating_system_family = "LINUX" }`, one container `core-api` on `var.container_port` (8080), awslogs → the T008 group, `environment` from `var.environment`, `secrets` from `var.secrets`, `execution_role_arn` + `task_role_arn` from T009.
- [X] T013 [US1] ECS service in `main.tf`: `desired_count = var.desired_count` (1), `launch_type = FARGATE`, `network_configuration` (T006 subnets, task SG, `assign_public_ip = var.assign_public_ip`), `load_balancer` → the T015 target group, `wait_for_steady_state = false` (research R7).
- [X] T014 [US1] Internet-facing ALB in `main.tf`: `${name_prefix}-core-api`, ALB SG, two public subnets/two AZs, `idle_timeout = var.idle_timeout` (120).
- [X] T015 [US1] Target group (`target_type = ip`, health check `path = var.health_check_path` `/healthz`, matcher 200) + HTTPS:443 listener (`certificate_arn = var.certificate_arn`, TLS13-1-2 policy, forward → TG) + HTTP:80 listener (fixed 301 redirect to HTTPS) in `main.tf`.
- [X] T016 [P] [US1] A + AAAA alias records in `infra/modules/ecs-fargate-web-service/dns.tf` → `aws_lb.this.dns_name` / `.zone_id` in `var.zone_id`, `evaluate_target_health = true`.
- [X] T017 [US1] Module `outputs.tf`: `alb_dns_name`, `hostname_url`, `ecr_repository_url`, `cluster_name`, `service_name`, `execution_role_arn`, `task_role_arn`.
- [X] T018 [US1] Env wrapper `infra/envs/dev/core-api.tf`: instantiate `module "core_api"` wiring `certificate_arn = module.dns.certificate_arn`, `zone_id = module.dns.zone_id`, `hostname = "${var.core_api_subdomain}.${module.dns.zone_name}"`, `name_prefix = module.shared.name_prefix`, `aws_region = var.aws_region`, `image_tag = var.core_api_image_tag`, `cpu/memory/desired_count` from vars. (The `environment`/`secrets` maps are completed in US5.)
- [X] T019 [US1] Publish `/effy/${var.env}/core-api/base_url = module.core_api.hostname_url` as an `aws_ssm_parameter` in `core-api.tf` (single writer, Principle II).
- [X] T020 [US1] `terraform fmt` + `terraform validate` on the module and on `infra/envs/dev`.

**Checkpoint**: The front door, service and branded address exist and pass `validate`. Live reachability is proven after US5 (config) + the operator deploy.

---

## Phase 4: User Story 2 - One address pattern, per environment, config-only (Priority: P1)

**Goal**: Producing `core-api.effyshopping.com` for prod is a configuration change only — no app or template-logic edit.

**Independent Test**: Review confirms every env-specific value is a variable; swapping dev config for prod config yields the apex hostname with no source edit.

- [X] T021 [P] [US2] Add dev-default variables to `infra/envs/dev/variables.tf`: `core_api_subdomain` (default `"core-api"`), `core_api_image_tag` (`"latest"`), `core_api_cpu` (256), `core_api_memory` (512), `core_api_desired_count` (1), `core_api_cors_origins` (customer-web dev origin + `http://localhost:3000`), `core_api_assign_public_ip` (true), `core_api_subnet_ids` (optional override, default `[]` → module resolves default-VPC public subnets). Each with a clear description.
- [X] T022 [US2] In `core-api.tf`, ensure hostname, region, CORS, sizing, subnets and every secret/param reference are variable- or contract-driven (no literal); `AWS_REGION` flows from `var.aws_region`. Confirm no environment-specific literal remains.
- [X] T023 [US2] Add a comment block to `core-api.tf` mapping the prod promotion knobs (subnet_ids, assign_public_ip=false, apex hostname, prod secret ARNs, immutable tag) to `data-model.md § Production delta`, so promotion is discoverable at the call site.

**Checkpoint**: The deployment is fully parameterized; prod is a `.tfvars`/wrapper change, not a rewrite.

---

## Phase 5: User Story 3 - Lowest cost, no autoscaling, documented spend (Priority: P1)

**Goal**: The cheapest shape — single task, no autoscaling, no NAT, thrifty registry/logs — with a recorded cost figure and an auditable negative space.

**Independent Test**: `terraform plan` / `state list` shows exactly one service, no autoscaling, no NAT/endpoint/new-cert/new-secret/new-DB; recorded cost ≤ $32/mo.

- [X] T024 [P] [US3] ECR repository + lifecycle in `infra/modules/ecs-fargate-web-service/ecr.tf`: `${name_prefix}-core-api`, `scan_on_push = true`, lifecycle policy keep last 10 images / expire untagged after 1 day. Feed `ecr_repository_url` to the task-def image reference (T012) and output (T017).
- [X] T025 [US3] Set the cheapest single-task rollout on the service (T013): `deployment_minimum_healthy_percent = var.min_healthy_percent` (0) and `deployment_maximum_percent = var.max_percent` (100) — ECS never runs two tasks (research R8).
- [X] T026 [US3] Negative-space guarantee: confirm the module + wrapper declare **no** `aws_appautoscaling_*`, **no** `aws_nat_gateway`/`aws_eip`(nat)/`aws_vpc_endpoint`, **no** new `aws_acm_certificate`/`aws_secretsmanager_secret`/`aws_db_instance`. Record this list as a comment in `core-api.tf` for the reviewer/audit.
- [X] T027 [US3] Confirm the recorded cost breakdown (~$30/mo, target ≤ $32) is consistent across `research.md` R12, `plan.md`, and `quickstart.md` (FR-020/SC-005).

**Checkpoint**: The shape is provably the cheapest that meets the other FRs, and the figure is written down.

---

## Phase 6: User Story 4 - Health-gated routing; no silent bad deploy (Priority: P2)

**Goal**: Traffic reaches the single task only while healthy; a bad version auto-rolls back instead of serving errors.

**Independent Test**: Make the task unhealthy → ALB deregisters it and returns 503; restore → traffic resumes. Push a health-failing image → circuit breaker rolls back to the last good task def.

- [X] T028 [US4] Tune the target-group health check (T015): `path = /healthz` (liveness, NOT `/readyz` — research R9), `matcher = 200`, `interval = 30`, `healthy_threshold = 3`, `unhealthy_threshold = 3`, `timeout = 5`, `deregistration_delay = 30`.
- [X] T029 [US4] On the service (T013): `deployment_circuit_breaker { enable = true, rollback = true }` and `health_check_grace_period_seconds = 60` (FR-009 — a health-failing deploy is observable and auto-reverted).
- [X] T030 [US4] Set `enable_execute_command = true` on the service for shell-less debugging (ECS Exec) — no bastion, no cost.

**Checkpoint**: Routing is health-gated and a broken deploy cannot silently become the serving state.

---

## Phase 7: User Story 5 - Secrets delivered at runtime, never baked in (Priority: P2)

**Goal**: DB password + Stripe secrets injected via ECS `valueFrom`; nothing secret in the image, task-def plaintext, state or logs; least-privilege IAM.

**Independent Test**: Inspect the image and logs → no secret material; the task def references only ARNs; the container boots and reaches the DB.

- [X] T031 [US5] Execution-role inline policy in `iam.tf`: `secretsmanager:GetSecretValue` on **exactly** the DB master secret ARN + the two Stripe secret ARNs (from `var.secrets`), plus `kms:Decrypt` on the secrets' KMS key. No wildcards.
- [X] T032 [US5] Task-role inline policy in `iam.tf`: `s3:GetObject` on `${var.task_role_s3_bucket_arn}/*` (product-media presign, research R6).
- [X] T033 [US5] Complete the `environment` and `secrets` maps in `core-api.tf`: non-secret `environment` = EFFY_ENV, PORT=8080, AWS_REGION, LOG_LEVEL, CORS_ALLOWED_ORIGINS (var), AWS_MEDIA_BUCKET (`aws_ssm_parameter.media_bucket.value`), AUTH_CUSTOMER_POOL_ID + AUTH_CUSTOMER_CLIENT_ID (this root's cognito resources, `web,mobile`), DB_HOST/DB_PORT/DB_NAME/DB_USER (from `/effy/<env>/db/*`); `secrets` = DB_PASSWORD ← db master secret ARN `:password::`, STRIPE_SECRET_KEY ← `/effy/<env>/stripe/secret_key` ARN, STRIPE_WEBHOOK_SECRET ← `/effy/<env>/stripe/webhook_secret` ARN. Pass `task_role_s3_bucket_arn` = product-media bucket ARN.
- [X] T034 [US5] Verify secret-safety in code review: the task definition references only ARNs (no plaintext secret); Terraform state carries no secret value; `terraform validate` clean. (Runtime log/image sweep is the operator step T049.)

**Checkpoint**: The container is fully, secret-safely configured and boots against the dev DB.

---

## Phase 8: User Story 6 - Repeatable operator deploy (Priority: P3)

**Goal**: Documented, repeatable build → push → roll flow; first bring-up from nothing.

**Independent Test**: Following quickstart on a clean env reaches a healthy service; a second push+deploy serves the new version with no undocumented step.

- [X] T035 [P] [US6] Makefile target `core-ecr-login`: `aws ecr get-login-password | docker login` against the module's ECR repo (repo URL read from Terraform output or SSM), `ENV`/`AWS_PROFILE`/`AWS_REGION`-parameterized like the `edge-deploy` family.
- [X] T036 [P] [US6] Makefile target `core-image-push`: `docker buildx build --platform linux/arm64 --target runtime -t <ecr>:$(TAG) apis/core-api --push` (default `TAG=latest`; prod uses a git-sha).
- [X] T037 [US6] Makefile target `core-deploy`: `aws ecs update-service --force-new-deployment` on the cluster/service, then `aws ecs wait services-stable`.
- [X] T038 [US6] Confirm `wait_for_steady_state = false` (T013) so the first `terraform apply` returns before any image exists (research R7).
- [X] T039 [US6] Finalize `quickstart.md` runbook against the real Makefile target names, cluster/service names and SSM key — prechecks, apply, push, deploy, rollback proof, client repoint.

**Checkpoint**: Bring-up and version rolls are one documented flow.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T040 [P] `terraform fmt -recursive` + `terraform validate` on `infra/modules/ecs-fargate-web-service` and `infra/envs/dev`; `go build ./... && go vet ./... && gofmt -l` on `apis/core-api` + `make core-test`.
- [X] T041 [P] Reconcile the two contract docs (`contracts/core-api-runtime.contract.md`, `contracts/ssm-core-api.contract.md`) with the final variable/output names.
- [X] T042 [P] Add a core-api production promotion note to `infra/envs/README.md`: apex hostname + cert, private subnets + NAT/endpoints, private DB, immutable image tag, backups on (data-model § Production delta).
- [X] T043 Update the `CLAUDE.md` "Current status" hot-path line to note core-api's dev cloud deploy slice (040) and that its prod go-live carries the recorded dependencies.
- [X] T044 Record the post-design Constitution re-check result (PASS) in `plan.md` (already noted) and confirm no new outward-facing identifier was introduced.

### ⚙️ Operator live-AWS steps (handed off — Claude does NOT run these)

- [ ] T045 ⚙️ OPERATOR [US3] `cd infra/envs/dev && terraform plan -out core-api.plan` → **cost/negative-space audit** (one service, no autoscaling/NAT/endpoint/new-cert/new-secret/new-DB) → `terraform apply core-api.plan`.
- [ ] T046 ⚙️ OPERATOR [US6] `make core-ecr-login ENV=dev` → `make core-image-push ENV=dev TAG=latest` → `make core-deploy ENV=dev`; `aws ecs wait services-stable`.
- [ ] T047 ⚙️ OPERATOR [US1] Acceptance: `curl https://core-api.dev.effyshopping.com/healthz` → 200 trusted TLS (SC-001); a real read `/v1/storefront/home` (SC-002); HTTP→HTTPS 301 (SC-007); uncovered-host + long-request checks (SC-010).
- [ ] T048 ⚙️ OPERATOR [US4] Force the task unhealthy → confirm ALB deregisters + 503, restore → resumes (SC-006); push a deliberately health-failing image → confirm circuit-breaker rollback, then restore.
- [ ] T049 ⚙️ OPERATOR [US5] Sweep image + `aws logs tail /ecs/effy-dev-core-api` for `password=|sk_…|whsec_|BEGIN|AKIA` → clean (SC-008).
- [ ] T050 ⚙️ OPERATOR [US3] `terraform state list | grep -E 'appautoscaling|nat_gateway|vpc_endpoint|acm_certificate'` → empty; exactly one `aws_ecs_service` (SC-004); record the ~$30/mo figure (SC-005).
- [ ] T051 ⚙️ OPERATOR [US2] Config-only review (SC-003); read `/effy/dev/core-api/base_url` and repoint customer-web + customer-mobile `CORE_API_BASE_URL`.
- [ ] T052 ⚙️ OPERATOR Sign-off (SC-001…SC-010) + commit.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps. **Foundational (P2)** → after Setup; **blocks all stories**.
- **US1 (P3)** → after Foundational. The MVP front door.
- **US2/US3/US4/US5** → build on US1's resources (same module files), so they run **after US1** in code order, though each is a distinct concern. US5 is what makes US1 boot & serve real data live.
- **US6 (P8)** → after the module + wrapper exist (needs the ECR repo + service names).
- **Polish (P9)** → after US1–US6 code is in; the ⚙️ OPERATOR steps run last, in the order T045→T052.

### Story dependencies (honest for IaC)

- **US1** is the spine; **US5** is required for the service to actually boot (DSN needs the injected password) and for real reads — US1's *liveness* proof (`/healthz`) is independent, its *data* proof needs US5.
- **US2/US3/US4** are properties layered onto US1's resources; each has its own live proof and none blocks another.

### Parallel opportunities

- Setup: T001, T002, T004 in parallel (app + docker), T005 alongside.
- Foundational: T007, T008, T009 in parallel (SGs / logs / IAM — different files).
- US1: T016 (dns.tf) parallel with the main.tf work once the ALB exists.
- US2: T021 (variables.tf) parallel with module work.
- US3: T024 (ecr.tf) parallel.
- US6: T035, T036 in parallel (both Makefile but independent recipes).
- Polish: T040, T041, T042 in parallel.

---

## Parallel Example: Foundational

```bash
# Different files, no ordering between them:
Task: "Security groups in infra/modules/ecs-fargate-web-service/main.tf"     # T007
Task: "CloudWatch log group in .../logs.tf"                                    # T008
Task: "IAM role skeletons in .../iam.tf"                                       # T009
```

---

## Implementation Strategy

### MVP first (US1 + minimal US5)

1. Phase 1 Setup (app DSN change + module skeleton).
2. Phase 2 Foundational (networking, SGs, IAM, logs).
3. Phase 3 US1 (front door + service + DNS) **and** Phase 7 US5 (secrets/config) — together the service boots and is reachable.
4. **STOP & VALIDATE**: operator applies, pushes the image, curls `/healthz` and a real read over HTTPS.

### Incremental hardening

5. US3 (cost audit + ECR/log thrift), US4 (health gating + rollback), US2 (parameterization review), US6 (deploy tooling + runbook) — each with its own live proof.
6. Polish + operator sign-off.

---

## Notes

- `[P]` = different files, no incomplete dependency. Same-module-file tasks are sequential by design.
- ⚙️ OPERATOR tasks are the only ones touching live AWS (apply / push / deploy / acceptance) — per the platform mode of work, Claude authors everything and hands these off with exact commands.
- The only application change is T001/T002 (DSN-from-parts); the local `make core-run` path stays on `DB_DSN` and must remain green (T003).
- Production is a configuration change **plus** two recorded dependencies (apex cert/record; private DB + NAT/endpoints) that are NOT built here.
