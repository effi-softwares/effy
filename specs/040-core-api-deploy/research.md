# Research: Core-API Cloud Deployment (040)

Phase 0 decisions. Each: **Decision · Rationale · Alternatives rejected.** The overriding constraint
throughout is **lowest cost with robustness knowingly sacrificed** (operator directive), with the load
balancer retained as a firm operator decision.

## R1 — Runtime: ECS Fargate service, single fixed task, no autoscaling

**Decision**: One **ECS Fargate service** on the platform's account, `desired_count = 1`, **no
Application Auto Scaling resources at all**. Launch type Fargate (not EC2). Cheapest task size:
**256 CPU units (0.25 vCPU) / 512 MB**, **ARM64** (`runtime_platform.cpu_architecture = "ARM64"`).

**Rationale**: Fargate has no cluster-instance floor to pay for (EC2 launch type would mean paying for
a whole EC2 host 24/7 even at 0.25 vCPU of use). 0.25 vCPU / 0.5 GB is the **smallest Fargate task
size that exists** and is ample for a distroless Go binary that already runs in a ~15 MB image locally.
ARM64 (Graviton) Fargate is ~20% cheaper per vCPU-hour than x86 and the existing `Dockerfile` is
already `TARGETARCH`-aware and documents "linux/arm64 for Fargate" — so ARM is free to adopt. No
autoscaling is an explicit requirement (FR-005) and also the cheapest posture: no scaling target, no
CloudWatch alarms driving scale, exactly one running copy.

**Alternatives rejected**: (a) **EC2 launch type / a t4g nano host** — reintroduces a paid always-on
instance and cluster management; Fargate at this size is cheaper and simpler. (b) **App Runner** —
simpler but pricier per-hour at idle and gives less control over the ALB/health/networking the
operator asked for; also can't reuse the existing wildcard cert + Route 53 pattern as cleanly.
(c) **Lambda (container image)** — the hot path is a long-lived Gin server with pooled pgx
connections; forcing it behind Lambda would fight its architecture and cold-start the DB pool. The
constitution fixes the hot path on Fargate.

## R2 — Front door: internet-facing Application Load Balancer, reusing the wildcard cert

**Decision**: One **internet-facing Application Load Balancer** with two listeners: **HTTPS :443**
(certificate = the env's existing wildcard `module.dns.certificate_arn`, TLS policy `ELBSecurityPolicy-TLS13-1-2-2021-06`)
forwarding to the service's target group, and **HTTP :80** with a **fixed 301 redirect to HTTPS**.
Target group type `ip` (required for Fargate/awsvpc), health check path **`/healthz`**. `idle_timeout`
set to **120 s** (comfortably covers checkout round-trips). ALB spans **two public subnets in two
AZs** (an ALB requires ≥2 AZs) — this does **not** add a second task; the single task still runs once.

**Rationale**: The ALB is the operator's firm choice ("otherwise it won't work as I expected") and is
what provides trusted HTTPS at a stable address plus **health-gated routing to the single task**
(FR-008). `core-api.dev.effyshopping.com` is **one label** under `dev.effyshopping.com`, so the
already-issued regional wildcard `*.dev.effyshopping.com` covers it with **no new certificate** — the
exact reuse `edge-domain.tf` performs for `api.dev.effyshopping.com`. The ALB certificate is
**regional** (`ap-southeast-2`), so unlike a CloudFront cert it needs **no `us-east-1` special-casing**.

**Alternatives rejected**: (a) **Network Load Balancer** — cheaper per-LCU but TLS termination + host
routing + HTTP→HTTPS redirect + path health checks are all first-class on ALB and awkward on NLB; ALB
is the operator's decision regardless. (b) **API Gateway HTTP API + VPC Link/Cloud Map** — cheaper,
but imposes a 30 s timeout and 10 MB cap on a latency-sensitive commerce path, uses DNS-based
discovery rather than active health checks, and (per the operator's explicit reconsideration) was
rejected in favour of the ALB. (c) **Public task IP with no LB + Caddy sidecar for TLS** — cheapest,
but the task's public IP changes on every replacement (breaking DNS), gives no health-gated routing,
and the operator explicitly wants the ALB. Not pursued.

## R3 — Network: default VPC, public subnets, task gets a public IP, NO NAT gateway

**Decision**: Run both the ALB and the single task in the account's **default VPC** using its **public
subnets**; the task runs with **`assign_public_ip = true`**. **No NAT gateway, no VPC interface
endpoints, no private subnets.** VPC and subnets are resolved via `data "aws_vpc" "default"` +
`data "aws_subnets"` (public), never hard-coded ids.

**Rationale**: This is the single biggest cost decision. A Fargate task in a **private** subnet needs a
**NAT gateway** (~$32/mo + data processing) or a fleet of interface endpoints to reach ECR, Secrets
Manager, SSM, Cognito (JWKS), Stripe and the database. `edge-network.tf` already worked this exact
problem for the Lambdas and chose the same answer: **take the workload OUT of private networking** so
it egresses over an ordinary internet path for **$0**. A public-subnet task with a public IP reaches
ECR/Secrets/SSM/Cognito/Stripe over the internet and reaches the **already-public dev database**
directly — no NAT, no endpoints. This is the accepted dev trade the platform already runs under
(`db_allowed_cidrs = ["0.0.0.0/0"]`, forced TLS).

⚠ **Explicitly invalid for production** — the same clause in `edge-network.tf` and `infra/envs/README.md`
requires prod to place the DB in **private** subnets (`db_publicly_accessible = false`) and give
compute a private path back. For core-api prod that means the task moves to **private subnets** with a
**NAT gateway or interface endpoints** and reaches a private RDS — a real prod cost/shape change,
recorded as a dependency (spec Dependencies; data-model.md § Production delta). The module exposes the
subnet ids and `assign_public_ip` as inputs so prod flips them without new design.

**Alternatives rejected**: (a) **Private subnets + NAT** — correct for prod, but ~$32/mo of NAT for a
dev slice whose whole point is "cheapest"; rejected for dev, required for prod. (b) **Private subnets +
interface endpoints** — multiplies per-endpoint hourly cost (ECR api+dkr, S3 gateway, Secrets, SSM,
Logs, plus no path to Cognito/Stripe which are public) — the exact multiplication 009 hit; rejected.

## R4 — The branded address, per-environment, config only

**Decision**: A new single-label subdomain variable **`core_api_subdomain` (default `"core-api"`)**.
The hostname is `local.core_api_domain = "${var.core_api_subdomain}.${module.dns.zone_name}"` →
`core-api.dev.effyshopping.com`. Route 53 **A + AAAA alias** records in `module.dns.zone_id` point at
the ALB (`aws_lb.this.dns_name` / `.zone_id`), `evaluate_target_health = true`. The service's base URL
is **published to SSM** at **`/effy/<env>/core-api/base_url`** (`https://core-api.dev.effyshopping.com`)
so clients read it from the contract, exactly as `edge-domain.tf` publishes `/effy/<env>/edge/api_endpoint`.

**Rationale**: This mirrors `edge-domain.tf` one-for-one (alias not CNAME so it survives ALB
recreation and costs nothing to query; SSM-published so no client hard-codes a hostname). Production
becomes `core_api_subdomain = "core-api"` against a namespace of the **apex** — see the production
delta below — with **no code or template-logic change**, satisfying FR-014/SC-003.

⚠ **Production hostname shape differs.** Dev's namespace is the child zone `dev.effyshopping.com`, so
`core-api.dev.effyshopping.com` is covered by `*.dev.effyshopping.com`. Production's target is
`core-api.effyshopping.com` — a label **directly under the apex** `effyshopping.com`, which is the
reserved production zone owned by `infra/global/`. That record and a certificate covering
`core-api.effyshopping.com` (an apex-child wildcard `*.effyshopping.com`, or a SAN on a prod cert)
must exist in the **prod** root, not here. Recorded as a production dependency; dev is unaffected.

**Alternatives rejected**: (a) **CNAME to the ALB** — costs a lookup, doesn't survive ALB recreation
transparently, and can't sit at a zone apex; alias is strictly better (the edge already chose alias).
(b) **Reuse `api_subdomain`** — that name is the cold path's; the `api_subdomain` variable's own
documentation reserves a distinct name for the hot path ("the hot path (core-api) gets its own name
when it deploys").

## R5 — Runtime configuration & secret delivery (FR-011/FR-012) — the crux

**Decision**: The container receives its configuration through the ECS task definition, split by
sensitivity:

- **Non-secret values → `container.environment`** (plaintext task-def is fine; none are secret):
  `EFFY_ENV`, `PORT=8080`, `AWS_REGION`, `LOG_LEVEL`, `CORS_ALLOWED_ORIGINS`, `AWS_MEDIA_BUCKET`,
  `AUTH_CUSTOMER_POOL_ID`, `AUTH_CUSTOMER_CLIENT_ID` (the `web,mobile` client-id pair). Terraform
  resolves these from its **own resources / the SSM contract it already owns** in this root (the
  cognito module outputs, `aws_ssm_parameter.media_bucket`), never literals.
- **Secret values → `container.secrets` (`valueFrom`)**, which ECS resolves **at task start via the
  execution role** so the plaintext never appears in the task definition, Terraform state, or logs:
  - `DB_PASSWORD` ← the **existing RDS-managed master secret**, JSON-key extraction
    (`<db_master_secret_arn>:password::`).
  - `STRIPE_SECRET_KEY` ← Secrets Manager `/effy/<env>/stripe/secret_key`.
  - `STRIPE_WEBHOOK_SECRET` ← Secrets Manager `/effy/<env>/stripe/webhook_secret`.

- **One small, permitted application change (FR-018)**: core-api learns to **compose its DSN from
  parts** when `DB_DSN` is unset — reading `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` (plaintext env,
  from the `/effy/<env>/db/*` SSM contract via Terraform) and `DB_PASSWORD` (the injected secret) into
  the same libpq keyword DSN `db-dsn.sh` builds (`sslmode=require connect_timeout=10`). `DB_DSN`
  remains honoured for the local `make core-run` loop, so nothing local changes.

**Rationale**: This keeps **no secret in the image** and **no secret in the task-def plaintext or
state** while creating **no new secret store** and **no duplicate of the password** — it reuses the
RDS-managed secret the platform already has (FR-011/FR-012/FR-013). The distroless-static image has
**no shell**, so an entrypoint script that composes the DSN is impossible; composing in-process is the
only shell-free way, and it is a genuinely deploy-motivated change (every cloud-run service configures
itself from the standard contract). The alternative of injecting a whole pre-composed `DB_DSN` secret
would duplicate the password into a second secret that must be re-synced whenever it rotates.

**Alternatives rejected**: (a) **Compose `DB_DSN` at deploy time and inject as plain env** — puts the
password in the task definition and Terraform state in cleartext; violates FR-012. (b) **A new
`/effy/<env>/core-api/db_dsn` secret holding the full DSN** — a second copy of the master password
(secret sprawl), needs re-sync on rotation; rejected in favour of JSON-key extraction from the one
existing secret. (c) **Sidecar/init container that writes the DSN** — extra container = extra cost and
complexity for what three env vars and five lines of Go do.

## R6 — IAM: two roles, least privilege, scoped to this env's ARNs

**Decision**: Two roles created by the module:

- **Execution role** (assumed by the ECS agent): the AWS-managed `AmazonECSTaskExecutionRolePolicy`
  (ECR pull + CloudWatch Logs `PutLogEvents`) **plus** an inline policy granting
  `secretsmanager:GetSecretValue` on **exactly** the three secret ARNs from R5 (DB master secret +
  two Stripe secrets) and `kms:Decrypt` on the KMS key those secrets use (the account default
  `aws/secretsmanager` unless a CMK is configured).
- **Task role** (assumed by the running container): `s3:GetObject` on
  `arn:aws:s3:::<name_prefix>-product-media/*` so the SDK can presign/verify product-media GETs. Region
  and pool JWKS need no IAM (public endpoints); JWT validation is signature-only.

**Rationale**: Least privilege, per-ARN, no wildcards on secret access (FR-012 posture). The task role
carries **only** what the running code calls; the execution role carries **only** what ECS needs to
start the task. Mirrors the media bucket's presign model (016) — core-api mints presigned GETs for
reads, which requires the signer to hold `s3:GetObject`.

**Alternatives rejected**: (a) **One combined role** — conflates "what ECS needs to launch" with "what
the app may do"; the split is the ECS-recommended posture and keeps secret-read off the app's own
identity. (b) **Broad `secretsmanager:GetSecretValue` on `*`** — unnecessary blast radius; the three
ARNs are known.

## R7 — Image registry, tagging, and the first-deploy ordering

**Decision**: One **ECR repository** `${name_prefix}-core-api` created by the module, with
`image_scanning_configuration.scan_on_push = true` and a **lifecycle policy keeping the last 10 images
/ expiring untagged after 1 day** (storage thrift). The service references an **image tag variable**
(`var.core_api_image_tag`, default `"latest"`). `aws_ecs_service.wait_for_steady_state = false` so the
apply returns even before the first image exists; the runbook then builds+pushes and forces a
deployment.

**Rationale**: The service and its image have a chicken-and-egg relationship. `wait_for_steady_state =
false` lets `terraform apply` complete and create everything; the service simply cannot place a
healthy task until the first image is pushed, at which point a forced new deployment converges it. The
lifecycle policy keeps ECR storage at cents. For **prod**, the recommendation (recorded) is an
**immutable git-sha tag** rather than `latest`, so a rollback is a known artifact.

**Alternatives rejected**: (a) **`-target` the ECR first in two applies** — works but adds an operator
step; `wait_for_steady_state = false` achieves the same with one apply. (b) **Immutable tags in dev
too** — good hygiene but more operator friction for a throwaway env; recommended for prod, optional in
dev.

## R8 — Deployment rollout: cheapest single-task rollout + circuit breaker

**Decision**: `deployment_minimum_healthy_percent = 0`, `deployment_maximum_percent = 100` (so ECS
**never runs two tasks at once** — it stops the old task, then starts the new: a brief, accepted
deploy gap), **`deployment_circuit_breaker { enable = true, rollback = true }`**, and health-check
grace period ~60 s. `enable_execute_command = true` (ECS Exec) for shell-less debugging — costs
nothing and needs no bastion.

**Rationale**: min 0 / max 100 is the **cheapest** rollout — it guarantees only ever **one** running
task (no transient second task's cost, and it fits any capacity), at the cost of a short unavailability
per deploy, which the operator pre-authorised. The circuit breaker with rollback makes FR-009 true:
a new version that fails its health check does **not** silently become the serving state — ECS marks
the deployment failed and rolls back to the last good task definition (observable, automatic, free).

**Alternatives rejected**: (a) **min 100 / max 200 (rolling, zero-downtime)** — briefly runs two tasks
(more cost + needs a moment of double capacity) and contradicts "single instance, cheapest"; rejected
given the operator's stated trade. (b) **No circuit breaker** — a bad deploy would sit at zero healthy
tasks (full outage) with no auto-revert; the breaker is free insurance.

## R9 — Health check target: `/healthz` (liveness), not `/readyz`

**Decision**: The ALB target-group health check hits **`/healthz`** (liveness — process is up),
matcher `200`, interval 30 s, healthy/unhealthy thresholds 3/3, timeout 5 s. `/readyz` (dependency
reachability) is **not** the LB gate.

**Rationale**: If the LB health check used `/readyz` and the database blipped, the single task would be
pulled from rotation and — with no second task — the whole service would go dark on a transient DB
hiccup, turning a brief dependency wobble into a total outage. `/healthz` keeps the task in rotation
while up, so a DB blip surfaces as honest per-request errors rather than a black hole. Both endpoints
already exist (confirmed in `internal/platform/health/handler.go`); no app change for health. `/readyz`
remains available for the operator's own diagnostics and the quickstart's dependency check.

**Alternatives rejected**: (a) **`/readyz` as the gate** — couples LB rotation to DB health with no
redundancy to absorb it; wrong for a single-task service. (b) **A new deep health endpoint** — needless;
the two the app has are the right two.

## R10 — CORS, timeouts, and the customer-web browser origin

**Decision**: `CORS_ALLOWED_ORIGINS` is a module input (`var.core_api_cors_origins`), defaulting for
dev to the customer-web origin(s) — the deployed customer-web URL and `http://localhost:3000`.
`idle_timeout = 120` on the ALB.

**Rationale**: customer-web makes **browser-side** calls to the hot path (cart sync, search infinite
scroll — 019/027), so the API's CORS must name the storefront origin; server-side SSR calls and the
native mobile app need no CORS. 120 s idle timeout leaves ample room for a Stripe checkout round-trip
without severing legitimate long requests (FR-010/SC-010). The origin list is config so prod swaps its
own storefront origin with no code change.

**Alternatives rejected**: (a) **`*` origin** — the storefront sends credentials/authorization; a
wildcard origin is both unsafe and incompatible with credentialed CORS. (b) **Hard-coded origin** —
breaks the config-only promotion rule (FR-014).

## R11 — Where the code lives: a reusable module + a thin env wrapper

**Decision**: A new Terraform **module `infra/modules/ecs-fargate-web-service`** (single public
container behind an ALB) instantiated by a thin **`infra/envs/dev/core-api.tf`**. The module takes:
env, name_prefix, region, vpc/subnet selection + `assign_public_ip`, cpu/memory, container_port,
health_check_path, image repo+tag, cert_arn, zone_id, hostname, `environment` map, `secrets` map,
task-role policy statements, cors origins, log retention, desired_count. It outputs the ALB DNS name,
hostname URL, ECR repo URL, service/cluster names, and the two role ARNs. New Makefile targets
`core-ecr-login`, `core-image-push`, `core-deploy` (force-new-deployment) join the existing
`edge-deploy` family.

**Rationale**: A module instantiated per-env is how this repo already does parity (`dns-env-zone`,
`rds-postgres`, `ses-*`), and it is what makes production a **config change** (FR-014/SC-003): the prod
root instantiates the same module with private subnets, `assign_public_ip = false`, the apex hostname,
and prod secret ARNs. The thin env wrapper wires the module to this root's existing resources (the DNS
module, the DB secret ARN, the media bucket, the cognito outputs).

**Alternatives rejected**: (a) **Inline everything in the dev root** — faster now, but prod would
copy-paste ~200 lines of ECS/ALB/IAM and drift; the module is the parity mechanism the constitution
prefers. (b) **A community ALB/ECS module** — heavy, opinionated, and pulls in features (autoscaling,
multiple containers) the "cheapest, no autoscaling" brief explicitly excludes.

## R12 — Cost model and the recorded target (FR-020/SC-005)

**Decision**: The slice's own recurring dev cost is **~$30/month**, targeted **≤ $32/month**, broken
down as: **ALB ~$20** (hourly base + minimal LCU — the largest line, retained by operator decision),
**Fargate 1×0.25 vCPU/0.5 GB ARM64 24/7 ~$9**, **ECR + CloudWatch Logs (7-day retention) + data ~$1–2**.
No NAT (—$32 avoided), no autoscaling, no second task, no CDN, no new certificate, no new secret store,
no new database. This figure is recorded here and in the quickstart, and re-checked before apply.

**Rationale**: Enumerating every billable resource and confirming each is the cheapest that meets the
other FRs is a first-class deliverable (US3). The ALB dominates and is the operator's deliberate spend;
everything else is at or near its floor.

**Alternatives rejected**: none — this is the accounting of the decisions above, not a new choice. The
one lever left (dropping the ALB) is excluded by operator decision; the other (out-of-hours schedule)
is available later but not built here.
