# Implementation Plan: Customer Storefront Continuous Deployment (dev)

**Branch**: `042-customer-web-cicd` | **Date**: 2026-08-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/042-customer-web-cicd/spec.md`

## Summary

Give `apps/customer-web` (Next.js 16 SSR, today local-only) a **managed, Git-driven CI/CD pipeline**:
a push/merge to the `dev` branch of `github.com/effi-softwares/effy` automatically builds **only**
that one workspace and serves it at **`https://dev.effyshopping.com`** over a trusted certificate,
with the same definition reaching the reserved apex `effyshopping.com` for production by supplying
different values.

**Technical approach** (from research): use **AWS Amplify Hosting's native Git-based pipeline in
monorepo mode** — the vendor-standard way to do CI/CD for a Turborepo + pnpm monorepo — rather than a
separate CI runner. One Amplify app (`platform = WEB_COMPUTE` for Next SSR) is scoped to a single app
root (`AMPLIFY_MONOREPO_APP_ROOT = apps/customer-web`) by a repo-root `amplify.yml` that declares
**exactly one** application, so no other surface can build. The whole thing is authored as Terraform
in a reusable `infra/modules/amplify-web-app` module instantiated per environment, keeping every
environment-specific value (domain, branch, backend origins, keys) a parameter. The storefront takes
over the zone apex, superseding the API-gateway alias records that 037 added only for email
resolution; the API keeps its own `api.` / `core-api.` subdomains. Environment values are wired from
in-account Terraform references (Cognito ids, API URLs) plus operator-supplied SSM secrets (GitHub
token, Stripe publishable key), and this slice publishes `/effy/<env>/web/site_url` — which 039's
newsletter already reads.

## Technical Context

**Language/Version**: HCL (Terraform, AWS provider); YAML (`amplify.yml` build spec); no application
code changes to `customer-web` itself (Next.js 16.2.6 / React 19 already built by 011/039).

**Primary Dependencies**: AWS Amplify Hosting (constitution-locked); AWS provider resources
`aws_amplify_app`, `aws_amplify_branch`, `aws_amplify_domain_association`, `aws_route53_record`,
`aws_ssm_parameter`; existing modules/roots — `dns-env-zone` (010), `core-api` (040), `edge-domain`
(010/037), the four Cognito pools (001).

**Storage**: None. No database, no migration. Configuration lives in SSM Parameter Store / Secrets
Manager (existing `/effy/<env>/…` contract) and in Amplify's env-var store.

**Testing**: Terraform `validate` + `fmt`; the storefront's existing gates (`typecheck`, `vitest`,
bundle-budget) run **inside the Amplify build** so a failing gate fails the deploy; operator live
walk (merge → live), monorepo-scope proof, apex/TLS proof. Playwright e2e stays **out** of the
hosting build (needs browsers + a running server; belongs in a separate CI, tracked as carry-forward).

**Target Platform**: AWS `ap-southeast-2` (Sydney) for the Amplify app; Amplify provisions its own
custom-domain ACM certificate in `us-east-1` automatically (the decision-locked "CloudFront-fronted
cert must live in us-east-1" is satisfied by Amplify, not by us).

**Project Type**: Infrastructure / deployment slice (Terraform + build config). No new client surface,
no backend service.

**Performance Goals**: Merge-to-live under ~15 min for a typical change (SC-002). Storefront runtime
performance is unchanged (already governed by 011/039's 174 KB bundle gate, enforced in the build).

**Constraints**: Only `apps/customer-web` may deploy (FR-006/FR-021). No secret in the browser bundle
(FR-016). Apex cutover must not break email sender-domain resolution (FR-011). No literal `dev`
value in build logic (FR-018). No operator-unsupplied real-world identifier anywhere (constitution).

**Scale/Scope**: One environment now (dev); the module is the vehicle for qa/staging/prod later. One
app, one branch mapping, one domain (apex + `www`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Rule | Status | Notes |
|---|---|---|
| **Infra is Terraform, multi-env, IaC** | ✅ | Amplify app + branch + domain + SSM authored as Terraform in a reusable module; qa/staging/prod are `env=`. |
| **Mode of work — Claude authors, operator runs risky/outward-facing steps** | ✅ | Claude writes Terraform + `amplify.yml`; operator runs `terraform apply`, installs the Amplify GitHub App / mints the PAT, and does the DNS cutover. No `apply` run by Claude. |
| **Real-World Identifiers (NON-NEGOTIABLE, v1.12.0)** | ✅ | GitHub token, Stripe publishable key, PostHog key, alarm endpoint — all operator-supplied via SSM/tfvars, none inferred. Banned address `techsupport+claudeone@phantm.com` appears nowhere. Missing values fail loudly (SSM data source on a non-existent key errors the plan). |
| **Principle II — shared packages are the single source, never copied** | ✅ | The `amplify.yml` installs from the monorepo root (`buildPath: /`) so `customer-web` consumes `@effy/{design-system,shared-types,api-client}` from the workspace, never a copy. |
| **Config, never a literal (region/addresses flow from vars/SSM)** | ✅ | Domain from `module.dns.zone_name`; backend origins from Terraform refs / SSM; branch + repo are variables. |
| **Principle V — design (monochrome, no card layouts)** | ✅ N/A | No UI change; the storefront's design is untouched. |
| **Principle VII — observability from day one** | ✅ | Amplify emits build + access logs and CloudWatch metrics; the plan adds a build-failure/domain-health signal (research D9). PostHog wiring is a known storefront gap (039) — out of scope here. |
| **Auth isolation (4 pools)** | ✅ N/A | Storefront authenticates against the **customer** pool only; this slice supplies its ids, changes no pool. |

**Result: PASS.** No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/042-customer-web-cicd/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1..D10
├── data-model.md        # Phase 1 — configuration entities (no DB)
├── quickstart.md        # Phase 1 — operator runbook (connect → apply → cutover → verify)
├── contracts/
│   ├── amplify-build.contract.md   # the amplify.yml build spec + env-var contract
│   └── config.contract.md          # /effy/<env>/{amplify,web}/* inputs & outputs
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
amplify.yml                                   # NEW — repo-root monorepo build spec, ONE app (apps/customer-web)
.npmrc                                         # NEW — repo root; node-linker=hoisted (Amplify pnpm/Turborepo requirement)

infra/modules/amplify-web-app/                 # NEW — reusable per-env Amplify web app
├── main.tf                                    #   aws_amplify_app (WEB_COMPUTE) + aws_amplify_branch + domain assoc + records
├── variables.tf                               #   env, repo_url, access_token, branch, app_root, domain, subdomains, env_vars, framework
├── outputs.tf                                 #   app_id, default_domain, storefront_url, branch_name
└── versions.tf

infra/envs/dev/
├── amplify-customer-web.tf                    # NEW — instantiate the module; wire env vars from refs + SSM; publish /effy/dev/web/site_url
├── edge-domain.tf                             # EDIT — remove the two apex alias records (zone_apex_a/aaaa); keep api. subdomain
└── variables.tf                               # EDIT — add amplify_* + stripe/posthog input variables (or read via SSM data sources)

apps/customer-web/.env.example                 # EDIT (docs) — add the deployed dev values as the reference; note REVALIDATE_SECRET is deferred (no route yet)
```

**Structure Decision**: Mirror the platform's established infra shape — a **module** for the reusable
resource graph (like `dns-env-zone`, `ses-domain-identity`, `ecs-fargate-web-service`) plus a **thin
env root file** that instantiates it with this environment's values. This is exactly what FR-018/FR-019
(prod-by-configuration) require: production is a second instantiation in `infra/envs/prod/`, not a
rewrite. The `amplify.yml` and `.npmrc` live at the **repo root** because Amplify requires them there;
the single-application declaration in `amplify.yml` is the mechanical guarantee that only
`customer-web` can ever build (FR-006/FR-008).

## Key design decisions (detail in research.md)

- **D1 — Managed pipeline, not a CI runner.** Amplify's native GitHub integration gives build + deploy
  + TLS + custom domain + atomic rollback in one system; a separate GitHub Actions → Amplify path adds
  moving parts for no gain. (FR-001..FR-005)
- **D2 — Monorepo mode, single app root.** `amplify.yml` declares one application, `appRoot:
  apps/customer-web`, `buildPath: /`; `AMPLIFY_MONOREPO_APP_ROOT=apps/customer-web`. Only this app
  builds; others are never declared. (FR-006/FR-007/FR-008)
- **D3 — `platform = WEB_COMPUTE`.** Required for Next.js 14+ SSR on Amplify. (US2/US5)
- **D4 — pnpm + `.npmrc node-linker=hoisted`.** Amplify's containers lack pnpm (install via `corepack
  enable` / `npm i -g pnpm@10.28.2` in `preBuild`) and Turborepo+pnpm require the hoisted linker. ⚠ The
  root `.npmrc` changes install behaviour for the **whole monorepo** — Phase 1 gate is a full-workspace
  re-verify. (FR-007)
- **D5 — GitHub connection = operator-supplied token in SSM.** Operator installs the Amplify GitHub
  App (preferred) or mints a fine-grained PAT with read on the repo; the token lives in SSM
  `SecureString` `/effy/<env>/amplify/github_access_token`; Terraform reads it via a data source and
  passes `access_token`. (FR-022; constitution Real-World Identifiers)
- **D6 — Apex takeover + record reconciliation.** Remove `edge-domain.tf`'s `zone_apex_a/aaaa` (they
  existed only so the sender domain resolves); the Amplify domain association's apex + `www` records
  replace them, and the name keeps resolving → email property preserved. The API keeps `api.` /
  `core-api.`. (FR-009..FR-012, SC-009) — **highest-risk task; verified live at apply.**
- **D7 — Env values: refs + operator secrets.** `NEXT_PUBLIC_*` are public by design and inlined at
  build; server-only `EDGE_API_BASE_URL` is not sensitive; Cognito ids come from `module.customer_pool`
  refs; site URL from `module.dns.zone_name`; core-api/edge URLs derived from the zone; Stripe
  publishable + PostHog keys from SSM (operator-supplied; blank is acceptable for PostHog, which the
  storefront hasn't initialised yet — 039). No secret reaches the browser bundle. (FR-013..FR-017)
- **D8 — Build gates in the pipeline.** `amplify.yml` runs `typecheck`, `vitest`, and the bundle-budget
  before `next build`; a non-zero exit fails the deploy and Amplify keeps the last good version live.
  (FR-003/FR-004/FR-005)
- **D9 — Rollback + observability are native + one signal.** Amplify preserves the prior deploy on
  failure and lists build history/logs; add a build-failure notification to the existing alerts topic.
- **D10 — `REVALIDATE_SECRET` deferred.** No `/api/revalidate` route exists yet (the `.env.example`
  entry is anticipatory for a separate, unspecced "home composer"); introducing the secret now would be
  guessing at an unbuilt feature. It is added when that route ships. (Edge case: server routes needing
  a secret fail loudly — honoured when the route exists.)

## Complexity Tracking

No constitution violations — section intentionally empty.
