---
description: "Task list — Customer Storefront Continuous Deployment (dev)"
---

# Tasks: Customer Storefront Continuous Deployment (dev)

**Input**: Design documents from `/specs/042-customer-web-cicd/`
**Prerequisites**: plan.md, spec.md, research.md (D1–D10), data-model.md (E1–E7), contracts/, quickstart.md

**Tests**: No automated test suite is authored by this slice (it is infrastructure/build config). The
storefront's existing gates (`typecheck`/`test`/`size`) run **inside the Amplify build** (FR-005), and
verification is via operator live walks (quickstart §5). "Verify/apply" tasks are **operator-run** per
the constitution's mode of work — Claude authors Terraform / `amplify.yml` / `.npmrc`; the operator
runs `terraform apply`, the GitHub connection, and the DNS cutover.

**Legend**: `[P]` = parallelizable (different file, no incomplete dependency). `[US#]` = user story.
⚠OP = operator-run (cloud-mutating or outward-facing). Paths are repo-relative.

---

## Phase 1: Setup (repo-root build files) — shared, blocks everything

**Purpose**: The monorepo build spec + package-manager config that make an Amplify build possible and
scope it to one app. The single-application declaration here is the mechanical guarantee of US3.

- [X] T001 [P] Create repo-root `amplify.yml` with a **single** `applications[]` entry per `contracts/amplify-build.contract.md` (`appRoot: apps/customer-web`, `buildPath: '/'`, preBuild corepack+pnpm, build gates `typecheck→test→size→build`, `artifacts.baseDirectory: apps/customer-web/.next`, cache paths).
- [X] T002 [P] Create repo-root `.npmrc` containing `node-linker=hoisted` (Amplify pnpm/Turborepo requirement, research D4).
- [ ] T003 ⚠ Whole-monorepo re-verify gate under the hoisted linker: from a clean tree run `rm -rf node_modules && pnpm install --frozen-lockfile`, then `pnpm -r typecheck`, `pnpm -r test`, and `pnpm --filter @effy/customer-web build`; spot-check `pnpm --filter @effy/shop-web build` and `pnpm --filter @effy/back-office build`. All MUST be green before proceeding (research D4). Fix any package broken by hoisted linking rather than weakening its isolation.

**Checkpoint**: The repo builds `customer-web` locally under the exact install/link config Amplify will use.

---

## Phase 2: Foundational (the reusable Amplify module + dev instantiation) — BLOCKS all stories

**Purpose**: The Terraform that provisions the app, branch, env plumbing, and the dev root that wires
real values. Nothing can deploy until this exists. Authored to be prod-portable (FR-018) from the start.

- [X] T004 [P] Create module skeleton `infra/modules/amplify-web-app/versions.tf` (AWS provider constraint matching the other modules).
- [X] T005 [P] Create `infra/modules/amplify-web-app/variables.tf`: `env`, `name_prefix`, `repository_url`, `access_token` (sensitive), `deploy_branch`, `app_root`, `framework`, `domain_name`, `subdomains` (apex+www), `env_vars` (map(string)), `enable_www` (bool) — every environment-specific value a variable, no literals (FR-018, E1/E2/E6).
- [X] T006 Create `infra/modules/amplify-web-app/main.tf`: `aws_amplify_app` (`platform = "WEB_COMPUTE"`, `repository`, `access_token`, `environment_variables` incl. `AMPLIFY_MONOREPO_APP_ROOT = var.app_root`, `enable_branch_auto_build = true`, `enable_branch_auto_deletion = false`) + `aws_amplify_branch` (`branch_name = var.deploy_branch`, `framework`, `enable_auto_build = true`) per data-model E1/E2. (Domain resources added in US2 phase.)
- [X] T007 [P] Create `infra/modules/amplify-web-app/outputs.tf`: `app_id`, `default_domain`, `storefront_url`, `branch_name`.
- [X] T008 Add input variables to `infra/envs/dev/variables.tf` for the Amplify app: `amplify_repository_url` (default `https://github.com/effi-softwares/effy`), `amplify_deploy_branch` (default `dev`), and any `stripe`/`posthog` toggles — following the file's existing validation/documentation style (no secrets in tfvars).
- [X] T009 Create `infra/envs/dev/amplify-customer-web.tf`: instantiate `module "amplify_web_app"` wiring `access_token` from `data "aws_ssm_parameter" "amplify_github_token"` (`/effy/dev/amplify/github_access_token`), `name_prefix` from `module.shared`, `deploy_branch = var.amplify_deploy_branch`, `app_root = "apps/customer-web"`, and the `env_vars` map from Terraform refs + SSM data sources per `contracts/config.contract.md` (Cognito ids from `module.customer_pool`, URLs from `module.dns.zone_name`, Stripe/PostHog from SSM). Domain wiring is added in Phase 4.
- [X] T010 [P] Document the operator SSM prerequisites in `infra/envs/dev/amplify-customer-web.tf` header comment (the `/effy/dev/amplify/github_access_token`, `/effy/dev/stripe/publishable_key`, optional PostHog keys) — constitution Real-World Identifiers; a missing required key MUST fail the plan loudly, not carry a guess.
- [X] T011 `terraform fmt -check -recursive infra/` — **clean**; `infra/modules/amplify-web-app` **`terraform validate` → Success**. ⚠ Env-root `terraform validate` is operator-gated: it needs S3 remote-state access (403 without operator AWS creds), so it runs at apply time.

**Checkpoint**: `terraform plan` produces a deployable Amplify app + `dev` branch (no domain yet), with all env values resolved.

---

## Phase 3: User Story 1 — Auto-redeploy on dev-branch push (Priority: P1) 🎯 MVP

**Goal**: A push/merge to `dev` auto-builds and deploys `customer-web`; failures leave the last good
version live; history + logs are visible.

**Independent test**: Merge a visible copy change to `dev` → a build auto-starts, succeeds, and is live
on the Amplify default hostname with **no** manual deploy command (SC-001); a deliberate type error
fails the build and keeps the prior version live (SC-005).

- [X] T012 [US1] Confirm the `build` phase in `amplify.yml` runs the gates before `next build` so a failing gate fails the deploy (FR-003/FR-005); confirm `enable_branch_auto_build = true` on both app and branch (FR-001).
- [X] T013 [P] [US1] Add a build-failure notification to the existing alerts topic: in `infra/envs/dev/alerts.tf` (or `amplify-customer-web.tf`) create an `aws_cloudwatch_event_rule`/target (or SNS wiring) for Amplify build `FAILED` state → `aws_sns_topic.alerts` (research D9, Principle VII).
- [X] T014 [US1] ⚠OP Stage-A apply: operator supplies the GitHub token to SSM (quickstart §0), then `make apply ENV=dev`; on the plan confirm **no Cognito pool shows "must be replaced"**. First build triggers automatically.
- [X] T015 [US1] ⚠OP Verify auto-deploy: Amplify console → `dev` branch build **SUCCEEDED**; open the Amplify default domain → storefront loads. Then merge a copy change to `dev`, confirm a new build auto-starts and goes live (SC-001), and time merge→live (SC-002, target <15 min).
- [ ] T016 [US1] ⚠OP Verify failure safety: push a deliberate type error on a throwaway commit → build **FAILS**, previous version stays live, failure + logs visible in history (SC-005/FR-002/FR-003). Revert.

**Checkpoint**: Merge-to-live CI/CD works on the Amplify hostname. MVP delivered.

---

## Phase 4: User Story 2 — Branded HTTPS address + apex takeover (Priority: P1)

**Goal**: The storefront is served at `https://dev.effyshopping.com` (apex + `www`) on a trusted cert,
replacing the API-gateway apex alias, with no break in email sender-domain resolution.

**Independent test**: `https://dev.effyshopping.com` serves the storefront over a valid cert (not an API
404); `www` redirects to apex; `api.`/`core-api.` unchanged; `dig` never returns empty during cutover
(SC-003/SC-009/FR-009..FR-012).

- [X] T017 [US2] Add domain resources to `infra/modules/amplify-web-app/main.tf`: `aws_amplify_domain_association` (`domain_name = var.domain_name`, `wait_for_verification = true`, `sub_domain` prefix `""`→branch and, when `enable_www`, prefix `"www"`→branch) per data-model E6.
- [X] T018 [US2] **SUPERSEDED by the D6 implementation flip** — Route53 records for the domain are **Amplify-managed** (in-account zone), NOT Terraform-managed: the apex ALIAS target is not cleanly derivable from the association resource and TF-managed validation records risk the verification deadlock. Documented in `main.tf` + research.md "Implementation amendments". No `aws_route53_record` is created by this slice for the domain.
- [X] T019 [US2] ⚠ Reconcile `infra/envs/dev/edge-domain.tf`: **remove** `aws_route53_record.zone_apex_a` and `.zone_apex_aaaa` (the API-gateway apex aliases that existed only for email resolution — 037), leaving a comment pointing to 042/FR-012. **Do NOT touch** the `api_a`/`api_aaaa` records or the `edge_api_default_endpoint` SSM param.
- [X] T020 [US2] Domain inputs wired in `infra/envs/dev/amplify-customer-web.tf`: `domain_name = var.amplify_domain_enabled ? module.dns.zone_name : ""` (two-stage cutover flag), `enable_www = true`; apex records in `edge-domain.tf` gated on the same flag (no-resolution-gap improvement over "delete", FR-011). `fmt` clean; module validates. (Env-root validate operator-gated, see T011.)
- [X] T021 [US2] ⚠OP Cutover apply (`make apply ENV=dev`) — the apply that adds the Amplify domain and removes the old apex aliases in one change set (quickstart §3). This is the highest-risk step; confirm the record-wiring option against the installed AWS provider version before applying.
- [X] T022 [US2] ⚠OP Verify cutover: `dig +short dev.effyshopping.com A` resolves to Amplify (not the gateway); `dig api.dev.effyshopping.com` and `core-api.dev.effyshopping.com` unchanged; `curl -sSI https://dev.effyshopping.com` → 200 on a valid cert; `curl -sSI https://www.dev.effyshopping.com` → redirect to apex; Amplify Domain management **Available** (SC-003/SC-009/FR-009/FR-010/FR-011/FR-012).

**Checkpoint**: The storefront is live at the branded address; email resolution preserved.

---

## Phase 5: User Story 3 — Only the customer storefront deploys (Priority: P1)

**Goal**: The pipeline builds/publishes only `apps/customer-web`; other surfaces are never built or
exposed, including on pushes that touch only their files.

**Independent test**: A push touching only `apps/back-office` produces no console content at the
storefront address; a push touching a shared package rebuilds `customer-web` correctly (SC-004/FR-006..FR-008).

- [X] T023 [US3] Assert the single-application invariant: confirm `amplify.yml` `applications` has length 1 (`apps/customer-web`) and that `AMPLIFY_MONOREPO_APP_ROOT` (T006) equals its `appRoot` (E5, contract invariant). Add a one-line comment in `amplify.yml` stating that adding a second application violates FR-006/FR-021.
- [ ] T024 [US3] ⚠OP Verify scoping: push a change touching only `apps/back-office` → confirm **no** internal console is reachable at `https://dev.effyshopping.com` and the customer-web build behaves per Amplify monorepo change-detection (SC-004). Then push a change to a shared package (`@effy/design-system`) → confirm `customer-web` rebuilds and resolves it (FR-007). Revert test changes.

**Checkpoint**: Exposure scope proven — only the storefront ships.

---

## Phase 6: User Story 5 — Correct backends + public settings (Priority: P2)

**Goal**: The deployed storefront reaches the deployed hot/cold paths, authenticates against the
customer pool, reports its public site URL, and ships no secret to the browser.

**Independent test**: Live catalogue loads from `core-api.dev.effyshopping.com`; canonical links use
`https://dev.effyshopping.com`; browser assets contain no server-only secret (SC-006/SC-007/FR-013..FR-017).

- [X] T025 [US5] Confirm the `env_vars` map in `infra/envs/dev/amplify-customer-web.tf` matches `contracts/config.contract.md`: `NEXT_PUBLIC_*` are public-safe only (FR-016), `EDGE_API_BASE_URL` has no `NEXT_PUBLIC_` prefix, `NEXT_PUBLIC_CORE_API_BASE_URL` → `core-api.<zone>`, `NEXT_PUBLIC_SITE_URL` → `https://<zone>`. Do **not** set `REVALIDATE_SECRET` (research D10).
- [X] T026 [P] [US5] Add `aws_ssm_parameter "/effy/dev/web/site_url" = "https://${module.dns.zone_name}"` in `infra/envs/dev/amplify-customer-web.tf` (output key; closes 039's newsletter fallback, contracts/config.contract.md).
- [X] T027 [P] [US5] Update `apps/customer-web/.env.example`: document the deployed dev values as the reference, and note `REVALIDATE_SECRET` is deferred (no `/api/revalidate` route yet — D10).
- [X] T028 [US5] ⚠OP `make edge-deploy SERVICE=customer ENV=dev` so the newsletter confirm link picks up `/effy/dev/web/site_url` (was falling back to localhost). Verify a confirm link points at `https://dev.effyshopping.com/newsletter/confirm...`.
- [ ] T029 [US5] ⚠OP Verify functional + secret hygiene on the live site: catalogue loads from `core-api.dev.effyshopping.com`; a customer sign-in flow reaches the customer pool; view-source / a canonical URL uses `https://dev.effyshopping.com` (no `localhost`); sweep deployed browser assets → **no** server-only secret present (SC-006/SC-007).

**Checkpoint**: The deployed storefront is fully functional and leak-free.

---

## Phase 7: User Story 4 — Production by configuration (Priority: P2)

**Goal**: Production reaches the reserved apex `effyshopping.com` by supplying values to the same
module — no pipeline rework.

**Independent test**: Review confirms every env-specific value is a parameter; producing prod is a new
instantiation, 0 pipeline-logic edits (SC-008/FR-018/FR-019).

- [X] T030 [US4] Audit `infra/modules/amplify-web-app/` for any `dev`/`dev.effyshopping.com` literal in logic — there must be none; all environment values flow through `variables.tf` (FR-018).
- [X] T031 [P] [US4] Add a prod-readiness note + example instantiation snippet to `infra/envs/README.md` (or a comment in the module): prod = instantiate in `infra/envs/prod/` with `domain_name = "effyshopping.com"`, `deploy_branch = "main"` (or the production release branch), prod Cognito refs, prod `/effy/prod/*` SSM keys, same `amplify.yml`/`.npmrc` (SC-008, quickstart "Prod bring-up").

**Checkpoint**: Prod is a configuration exercise, verified by review.

---

## Phase 8: Polish & sign-off

- [X] T032 [P] Update `docs/audiences/customer-capabilities.md` (§042) noting the storefront is now continuously deployed at `dev.effyshopping.com`.
- [X] T033 [P] Update root `CLAUDE.md` "Current status" / "Active feature" to record 042 and its open operator items.
- [X] T034 Write `specs/042-customer-web-cicd/SIGNOFF.md` capturing the SC walk results (SC-001..SC-009), carry-forwards (e2e in separate CI, `REVALIDATE_SECRET`, PostHog init, per-PR previews), and the apex-cutover verification outcome.
- [ ] T035 ⚠OP Commit the slice (`amplify.yml`, `.npmrc`, the module, the dev root edits, docs) once the live walk passes — per the platform's commit discipline.

---

## Dependencies & completion order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** are strict prerequisites for every user story.
- **US1 (Phase 3)** delivers the MVP and depends only on Phases 1–2 (deploys on the Amplify hostname).
- **US2 (Phase 4)** depends on US1 (an app + branch must exist to attach a domain). Highest risk.
- **US3 (Phase 5)** is satisfied structurally by Phase 1's single-app `amplify.yml`; its tasks are
  assertion + live verification, runnable once US1 has deployed.
- **US5 (Phase 6)** depends on Phase 2's env wiring; live verification (T029) is best after US2 (real domain).
- **US4 (Phase 7)** is a review/doc pass over the module; can run any time after Phase 2.
- **Phase 8** last.

### Parallel opportunities
- Phase 1: **T001, T002** in parallel (different files); T003 after both.
- Phase 2: **T004, T005, T007** in parallel; T006 after T005; T008/T010 parallel with module files.
- Phase 6: **T026, T027** in parallel.
- Phase 8: **T032, T033** in parallel.

### MVP scope
**Phases 1–3 (through US1)** = a working merge-to-live pipeline on the Amplify default hostname. Adding
**US2 (Phase 4)** puts it on `dev.effyshopping.com` — together these are the user's core ask.

---

## Notes
- ⚠OP tasks are operator-run (cloud-mutating / outward-facing): T014, T015, T016, T021, T022, T024,
  T028, T029, T035. Claude authors everything they apply.
- No DB migration in this slice (data-model.md).
- Carry-forwards recorded in T034 are deliberate scope boundaries, not omissions.
