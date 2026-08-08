# Sign-off: 040-core-api-deploy — Core-API Cloud Deployment (Cheapest Fargate + ALB)

**Status: CONCLUDED (PARTIAL BY DESIGN) — 2026-08-08.** The hot path is **deployed to dev and live** at
`https://core-api.dev.effyshopping.com`; the customer-mobile app is wired to it. The full acceptance
walk (the remaining SC proofs) and the commit are outstanding, recorded below — concluding the slice
closes the build, it does not make the unwalked proofs true.

## What this slice did

Gave `apis/core-api` — the Go/Gin hot path that had **only ever run in local Docker** — its first cloud
home: **one ECS Fargate task (0.25 vCPU / 0.5 GB, ARM64, fixed count, no autoscaling) behind an
internet-facing ALB**, at the cheapest posture, reusing the env's existing wildcard cert, DB, secret
contract and DNS zone. Packaged as a reusable module (`infra/modules/ecs-fargate-web-service`) + a thin
`infra/envs/dev/core-api.tf`, so **production is a configuration change** (with two recorded prod-only
dependencies).

- **Cost**: ~$30/mo dev (ALB ~$20 + Fargate ~$9 + ECR/logs ~$1–2). **No NAT gateway** (default-VPC
  public subnets + public IP — the same accepted dev trade the DB already runs under), **no
  autoscaling, no second task, no new cert/secret/DB.**
- **The one app change (FR-018)**: core-api now composes its DB DSN from parts (`DB_HOST/PORT/NAME/USER`
  + injected `DB_PASSWORD`) when `DB_DSN` is unset, so the password arrives as an **ECS-injected
  secret** rather than a pre-composed string. The local `make core-run` path (which sets `DB_DSN`) is
  untouched — `DB_DSN` still wins verbatim.
- **Secrets**: DB password (JSON-key extraction from the existing RDS master secret) + Stripe secrets
  injected via ECS `valueFrom`; **nothing secret in the image, task-def plaintext, Terraform state, or
  logs.**
- **Client contract**: `/effy/dev/core-api/base_url` published; customer-mobile's `CORE_API_BASE_URL`
  set to it (BuildKonfig, baked at build time).

## Live status

- ✅ **T045 — applied.** `make apply ENV=dev` succeeded after the live fix below. ALB, target group,
  listeners, ECS cluster/service, ECR, IAM roles, log group, A/AAAA alias records all created.
- ✅ **T046 — image built + deployed.** arm64 image pushed to ECR; `make core-deploy` rolled it;
  operator reports the **container is deployed**.
- ◐ **T051 — clients repointed (mobile).** customer-mobile `CORE_API_BASE_URL` set to the live URL.
  customer-web repoint not done here.

## ⚠ Live-only defect found and fixed (2026-08-08)

**Security-group description contained a non-ASCII em-dash** (`—`). AWS `CreateSecurityGroup` rejects
`GroupDescription` beyond ASCII (`InvalidParameterValue`), so the first `make apply` failed on
`aws_security_group.task` — **after** the Route 53 records were already created (partial apply). Fixed
by replacing the em-dash with a hyphen in `infra/modules/ecs-fargate-web-service/main.tf`; re-apply
resumed and completed. **Lesson**: `terraform validate` passes non-ASCII in a resource `description`
because it is schema-valid; only AWS rejects it at create time. Variable descriptions (Terraform-only,
never sent to AWS) may keep their em-dashes — only resource-level `description` arguments must be ASCII.

**Runbook defect also fixed**: the quickstart said bare `terraform init`, which uses default creds and
403s on the state bucket. Corrected to `make init/plan/apply ENV=dev` (the Makefile wraps
`AWS_PROFILE=ef terraform`), matching the rest of the platform.

## Machine-verified (before apply)

`gofmt` clean · `go vet` · `go build ./...` · core-api config unit tests (DSN-from-parts: shape matches
`db-dsn.sh`, `DB_DSN` overrides, missing part errors, no secret leaked) · `terraform validate` (module
+ dev root, offline) · `terraform fmt -check` · Makefile targets parse + appear in `make help`.

## ⚠ Open (operator — the acceptance walk + commit)

- **T047 — SC-001/002/007/010 not confirmed recorded.** The deploy succeeded, but the health/redirect/
  real-read curls in quickstart §4 were not walked back into this record. Run them and confirm
  `/healthz` → 200 (trusted TLS), `/v1/storefront/home` → real data, HTTP → 301.
- **T048 — SC-006 unhealthy-rotation + circuit-breaker rollback** unproven on the live service.
- **T049 — SC-008 secret sweep** (image + `aws logs tail /ecs/effy-dev-core-api`) not run.
- **T050 — SC-004/005 cost/negative-space audit** (`terraform state list` shows no autoscaling/NAT/
  endpoint/new-cert; record the ~$30/mo figure) not run.
- **T051 — customer-web** not repointed at `/effy/dev/core-api/base_url`; **CORS** origin still defaults
  to `http://localhost:3000` only — add the deployed storefront origin to `core_api_cors_origins`
  before customer-web makes browser calls.
- **T052 — commit.** Nothing in this slice is committed yet.
- **T004** — the arm64 build was verified by inspection during authoring (Docker was down); the real
  arm64 build+push happened in T046, so this is now effectively proven by the live deploy.

## Deferred (own slices)

- **CI/CD** — no pipeline for core-api's container yet (build → SHA-tagged image → ECR → ECS). The
  platform has `web.yml` + `infra.yml` (CI-only); container CD, OIDC AWS auth, and immutable SHA tags
  are their own slice (discussed 2026-08-08, deferred by operator).
- **Production bring-up** — apex hostname `core-api.effyshopping.com` (needs an apex record + a cert
  covering it, owned by the prod/global root, not the child wildcard); private subnets +
  NAT/endpoints; private DB; immutable image tag; DB backups on. Recorded in `data-model.md §
  Production delta` and `infra/envs/README.md`.

Spec/artifacts: [specs/040-core-api-deploy/](.).
