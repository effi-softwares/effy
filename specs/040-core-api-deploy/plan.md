# Implementation Plan: Core-API Cloud Deployment (Cheapest Fargate + ALB)

**Branch**: `040-core-api-deploy` | **Date**: 2026-08-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/040-core-api-deploy/spec.md`

## Summary

Give the **hot path** (`apis/core-api`, the Go/Gin backend that has only ever run locally) a durable
cloud home in **dev**, reachable over trusted HTTPS at **`core-api.dev.effyshopping.com`**, at the
**lowest sustainable cost** with robustness deliberately traded for price. The shape is an
**internet-facing ALB** in front of a **single ECS Fargate task** (0.25 vCPU / 0.5 GB, ARM64, fixed
count, **no autoscaling**), in the **default VPC's public subnets with a public IP and no NAT
gateway**, reusing the environment's **existing wildcard certificate**, **database**, **secret
contract** and **DNS zone**. Configuration and secrets are delivered at runtime from the platform's
existing SSM/Secrets contract — non-secret values as plain task-def env, secret values via ECS
`valueFrom` injection (no secret in the image, task-def plaintext, or state). The work is packaged as a
reusable Terraform module + a thin dev wrapper so **production is a configuration change**, and a
documented operator runbook covers first bring-up and rolling a new version.

The only application change is small and deploy-motivated (FR-018): core-api learns to **compose its DB
DSN from parts** when `DB_DSN` is unset, so the database password can arrive as an injected secret
rather than a pre-composed string. Everything local (`make core-run`) is untouched.

## Technical Context

**Language/Version**: Infrastructure — Terraform `>= 1.11`, AWS provider `~> 6.0` (matches this repo's
`versions.tf`). Application — Go 1.25 (existing core-api; one small config-loader change). Container —
existing multi-stage `Dockerfile` (distroless static, ARM64-capable).

**Primary Dependencies**: AWS ECS Fargate, Application Load Balancer, ECR, ACM (existing wildcard),
Route 53 (existing env zone), Secrets Manager (existing RDS + Stripe secrets), SSM Parameter Store
(existing `/effy/<env>/*` contract), CloudWatch Logs. The existing `dns-env-zone` module (cert + zone),
`rds-postgres` module (DB + master secret ARN), `_shared` module (name prefix + tags).

**Storage**: **No database schema change. No new migration.** One new **SSM parameter published**
(`/effy/<env>/core-api/base_url`). Reuses the existing product-media S3 bucket (read-only, for presign).

**Testing**: `terraform validate` + `terraform fmt` on the dev root and the new module;
`terraform plan` reviewed for the exact resource inventory (US3 audit); Go `build`/`vet`/`gofmt` +
`make core-test` for the DSN-composition change (unit test proving parts→DSN equals the `db-dsn.sh`
shape, and that `DB_DSN` still wins when set); live acceptance per quickstart (curl the health + a read
endpoint over HTTPS; unhealthy-task rotation proof; HTTP→HTTPS redirect; secret-absence sweep of image
+ logs; cost audit of the plan output).

**Target Platform**: AWS `ap-southeast-2`, dev environment. Public internet clients (customer-web
browser + SSR, customer mobile app).

**Project Type**: Infrastructure + delivery slice (Terraform module + env wrapper + Makefile targets +
one minimal Go config change + runbook). No new client, no new service code path.

**Performance Goals**: No change to hot-path latency budgets; the ALB adds a single in-region hop.
`idle_timeout = 120 s` accommodates checkout round-trips. Health check `/healthz` at 30 s interval.

**Constraints**: **Cheapest** — single fixed task, no autoscaling, no NAT, no CDN, no new cert, no new
secret store, no new DB; recurring dev cost **≤ ~$32/mo** (research R12). **Secret-safe** — no secret in
image, task-def plaintext, Terraform state, or logs (FR-012). **Config-only promotion** — every
env-specific value is a variable; unknowns fail loudly (FR-014, constitution Real-World Identifiers).
**This slice creates no new outward-facing identifier** — hostname derives from the approved namespace;
mail/endpoints untouched.

**Numeric thresholds** (pinned so tests/audits have something to bind to):

- **Task size: 256 CPU units / 512 MB, ARM64** — the smallest Fargate task (research R1).
- **`desired_count = 1`; zero Application Auto Scaling resources** (FR-005; audited in the plan output).
- **Rollout: `minimum_healthy_percent = 0`, `maximum_percent = 100`** — never two tasks; circuit
  breaker with rollback ON (research R8).
- **Health check: `/healthz`, matcher 200, interval 30 s, 3/3 thresholds, 5 s timeout** (research R9).
- **ALB `idle_timeout = 120 s`** (research R10, FR-010).
- **ECR lifecycle: keep last 10 images, expire untagged after 1 day. Log retention: 7 days** (thrift).
- **Recurring dev cost target: ≤ $32/mo attributable to this slice** (research R12, SC-005).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Spec-Driven Development** ✅ — spec.md → this plan → research/contracts/quickstart precede code;
  tasks map to acceptance criteria; live acceptance is operator-run per the mode of work.
- **II. Monorepo with Shared Contracts** ✅ — the deployment is packaged as a **reusable module**
  (`infra/modules/ecs-fargate-web-service`) consumed by the env root, not copy-pasted; it **reuses** the
  existing SSM/Secrets contract and the `dns-env-zone`/`rds-postgres`/`_shared` modules rather than
  duplicating any of them; the one new client-facing value (`/effy/<env>/core-api/base_url`) is
  published once and read by clients (Principle II single-writer).
- **III. Dual-Path Backend Discipline** ✅ — this is the **hot path** getting its own cloud presence,
  exactly as the constitution scopes it ("core-api on Fargate"; its go-live is its own slice). No
  cold-path or hot-path routing rule is changed; no traffic moves paths.
- **IV. Auth Isolation** ✅ — no auth change. core-api continues to **validate customer-pool JWTs and
  pin the issuer** itself (no auth proxy); the ALB terminates TLS and forwards, it does not authenticate.
  The customer pool id/client ids are delivered as non-secret config, as today.
- **V. Native-Feel, Consistent Design** ✅ — N/A (no UI). No design tokens touched.
- **VI. Architecture (the spine)** ✅ — no change to the three-layer slice, repository pattern, raw SQL,
  or explicit wiring. The DSN-from-parts change is confined to the composition-root config loader; no DI
  framework introduced.
- **VII. Observability & telemetry** ✅ — the service ships structured logs to **CloudWatch Logs**; its
  existing `/metrics` (Prometheus) and `/healthz`//`readyz` endpoints are unchanged. The ALB target
  health is itself an operational signal. (Wiring CloudWatch → Grafana dashboards/alerts is existing
  platform observability, not re-done here.)
- **Real-World Identifiers (NON-NEGOTIABLE)** ✅ — the only identifier introduced is the hostname
  `core-api.<namespace>`, derived from the **approved** platform namespace, not invented or read from
  session/environment. Every env-specific value is an operator-supplied variable; unknowns fail loudly
  (no defaulting to a guess). No banned address anywhere.
- **Mode of work** ✅ — Claude authors all Terraform, the module, the Go change, the Makefile targets and
  the runbook; **every live-AWS step (apply, image push, force-deploy) is handed to the operator** as
  exact commands.

**Gate result: PASS.** No violations; Complexity Tracking not required.

### Post-Design re-check (after Phase 1)

Re-evaluated after writing data-model.md + contracts + quickstart: still **PASS**. The design adds one
module, one env wrapper, three Makefile targets, one published SSM key, and one narrowly-scoped Go
config change. No principle is stretched; the single dev-posture trade (public-subnet task, no NAT) is
the platform's already-accepted dev network posture and is explicitly gated OFF for production.

## Project Structure

### Documentation (this feature)

```text
specs/040-core-api-deploy/
├── plan.md              # This file
├── research.md          # Phase 0 — R1..R12 (runtime, ALB, network, secrets, IAM, cost)
├── data-model.md        # Phase 1 — resource inventory, runtime config/secret contract, IAM, prod delta
├── quickstart.md        # Phase 1 — operator runbook (bring-up, image push, deploy, acceptance)
├── contracts/
│   ├── core-api-runtime.contract.md   # env vars, ports, health paths, secrets the container consumes
│   └── ssm-core-api.contract.md        # /effy/<env>/core-api/* published + /effy/<env>/* consumed
└── checklists/requirements.md          # spec quality checklist (done in /speckit-specify)
```

### Source Code (repository root)

```text
infra/
├── modules/
│   └── ecs-fargate-web-service/        # NEW — single public container behind an ALB, no autoscaling
│       ├── main.tf                     # cluster, task def, service, ALB, target group, listeners, SGs
│       ├── ecr.tf                      # repository + lifecycle policy
│       ├── iam.tf                      # execution role (+ scoped secret/kms) + task role
│       ├── logs.tf                     # CloudWatch log group (short retention)
│       ├── dns.tf                      # A/AAAA alias records to the ALB
│       ├── variables.tf                # env, sizing, subnets, assign_public_ip, image, cert, secrets…
│       ├── outputs.tf                  # alb_dns_name, hostname_url, ecr_repo_url, service/cluster, roles
│       └── versions.tf
└── envs/dev/
    ├── core-api.tf                     # NEW — instantiates the module; wires DB secret ARN, media bucket,
    │                                   #       cognito outputs, DNS module, CORS origins; publishes base_url
    └── variables.tf                    # + core_api_subdomain, core_api_image_tag, core_api_cpu/memory,
                                        #   core_api_cors_origins, core_api_desired_count (all defaulted)

apis/core-api/
└── internal/platform/config (or cmd/core-api/main.go composition root)
    └── DSN-from-parts loader change    # DB_DSN wins if set; else compose from DB_HOST/PORT/NAME/USER/PASSWORD
                                        # + a unit test proving equality with the db-dsn.sh keyword shape

Makefile                               # + core-ecr-login, core-image-push, core-deploy (force-new-deployment)
```

**Structure Decision**: A reusable module (`infra/modules/ecs-fargate-web-service`) + a thin env
wrapper (`infra/envs/dev/core-api.tf`) — the repo's established parity mechanism (like `dns-env-zone`,
`rds-postgres`). This is what makes production a configuration change (FR-014/SC-003) rather than a
copy-paste. The application change is isolated to the config/composition root; no feature package is
touched.

## Phase breakdown (for /speckit-tasks)

1. **App config (small, FR-018)**: DSN-from-parts loader + unit test; `docker-compose.yml`/`make
   core-run` remain on `DB_DSN` (regression-proof the local path).
2. **Module**: `ecs-fargate-web-service` — networking data sources, SGs, ECR, log group, IAM roles,
   task definition (env + secrets), cluster, service (rollout + circuit breaker), ALB + target group +
   two listeners, A/AAAA alias records, outputs. `terraform validate`/`fmt`.
3. **Env wrapper**: `core-api.tf` wiring the module to this root's DB master-secret ARN, Stripe secret
   ARNs, media bucket, cognito pool/client ids, `module.dns` (cert + zone), CORS origins; new variables
   with dev defaults; publish `/effy/<env>/core-api/base_url`. `terraform validate`/`fmt` + a reviewed
   `terraform plan` (the US3 resource audit: one task, no autoscaling, no NAT).
4. **Makefile + Docker**: `core-ecr-login`/`core-image-push` (buildx `--platform linux/arm64`, tag,
   push) and `core-deploy` (force-new-deployment); confirm the build produces an ARM64 image (FR-015).
5. **Contracts + runbook**: the two contract docs + quickstart; cost figure recorded (FR-020).
6. **Operator live steps** (handed off): apply → push image → force deploy → acceptance walk
   (SC-001..SC-010), including the unhealthy-rotation, redirect, secret-sweep and cost-audit proofs.

## Complexity Tracking

Not required — Constitution Check passed with no violations.

## Key risks & mitigations

- **First-apply flapping** (no image yet) → `wait_for_steady_state = false`; runbook pushes the image
  then forces a deployment (research R7).
- **Bad deploy → full outage** (single task) → deployment **circuit breaker with rollback** reverts to
  the last good task definition automatically (research R8, FR-009).
- **DB blip pulls the only task from rotation** → LB health checks **`/healthz`** (liveness), not
  `/readyz` (research R9).
- **Secret leakage** → secrets only via ECS `valueFrom`; image + logs swept for secret material in
  acceptance (FR-012/SC-008); Terraform references only ARNs, never values.
- **Production drift** → the module inputs (`subnet_ids`, `assign_public_ip`, hostname, secret ARNs,
  cors) are the exact knobs prod flips; the **prod-only** dependencies (apex cert/record, private DB +
  NAT/endpoints) are recorded in spec Dependencies and data-model § Production delta, not silently
  inherited.
- **No default VPC in the account** → the module resolves it via data source; if absent, apply fails
  loudly and the runbook's precheck catches it (research R3).
