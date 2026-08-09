# Data Model: Customer Storefront Continuous Deployment (dev)

Feature: 042-customer-web-cicd · Date: 2026-08-09

**No database, no migration.** This slice has no persistent domain data. The "entities" are
**configuration objects** — the Terraform resources and the config contract they read and write. This
document defines their shape, fields, and rules so tasks and contracts stay consistent.

---

## E1 — Amplify Web App (`aws_amplify_app`)

The managed representation of `apps/customer-web` on Amplify Hosting.

| Field | Value / Rule |
|---|---|
| `name` | `${name_prefix}-customer-web` (e.g. `effy-dev-customer-web`) |
| `repository` | `https://github.com/effi-softwares/effy` (variable) |
| `access_token` | from SSM `SecureString /effy/<env>/amplify/github_access_token` (data source; never in tfvars/state files) |
| `platform` | `WEB_COMPUTE` (Next.js SSR — INVARIANT, D3) |
| `build_spec` | omitted here; the repo-root `amplify.yml` overrides console settings (E5) |
| `environment_variables` | app-wide keys incl. `AMPLIFY_MONOREPO_APP_ROOT=apps/customer-web` (E4) |
| `enable_branch_auto_build` | `true` (auto-deploy on push — FR-001) |
| `enable_branch_auto_deletion` | `false` (never auto-remove branches) |

**Rules**: exactly ONE Amplify app is created for this surface; the app root is `apps/customer-web` and
nothing else (FR-006/FR-021).

---

## E2 — Deployment Branch (`aws_amplify_branch`)

Binds one repository branch to this environment's auto-deploy.

| Field | Value / Rule |
|---|---|
| `branch_name` | `var.deploy_branch` — `dev` for dev; `main`/`production` for prod (INVARIANT: a variable, never a literal in logic — FR-018) |
| `enable_auto_build` | `true` |
| `framework` | `Next.js - SSR` |
| `stage` | `DEVELOPMENT` (dev) / `PRODUCTION` (prod) — informational |
| `environment_variables` | branch-level overrides if any (most live at app level) |

**State transition (a deployment record, E3)**: `PENDING → PROVISIONING → RUNNING → (SUCCEED →
DEPLOYED) | FAILED`. On `FAILED`, the previously `DEPLOYED` build remains live (FR-003).

---

## E3 — Deployment / Build Record (Amplify-managed, not Terraform)

One build attempt per triggering commit. Not provisioned by us; consumed for verification.

| Field | Meaning |
|---|---|
| commit id | the source commit that triggered the build (FR-002) |
| status | running / succeeded / failed (E2 transition) |
| logs | build + deploy logs, retrievable from console/API (FR-002) |
| live? | only the latest **succeeded** build for the branch is served (FR-004) |

---

## E4 — Environment Configuration Set (Amplify env vars)

The values supplied to build + runtime. Full source table in `research.md` D7 and
`contracts/config.contract.md`. Classification rule:

- **`NEXT_PUBLIC_*`** — inlined into the browser bundle at build; MUST be public-safe values only
  (FR-016). Present as **build** env vars.
- **Server-only** (`EDGE_API_BASE_URL`, future `REVALIDATE_SECRET`) — no `NEXT_PUBLIC_` prefix; never
  in the browser bundle; available to the SSR runtime.
- **Build-control** (`AMPLIFY_MONOREPO_APP_ROOT`) — MUST equal the `amplify.yml` `appRoot` (E5) or the
  build errors.

**Sourcing rule**: in-account platform facts (Cognito ids, API/site URLs) come from Terraform
references; external/secret values (GitHub token, Stripe publishable key, PostHog key) come from SSM
and are operator-supplied (constitution). A missing required SSM key fails the plan loudly.

---

## E5 — Monorepo Build Spec (`amplify.yml`, repo root)

| Field | Value / Rule |
|---|---|
| `applications[]` | length **1** — only `apps/customer-web` (INVARIANT: FR-006/FR-008) |
| `applications[0].appRoot` | `apps/customer-web` (MUST equal `AMPLIFY_MONOREPO_APP_ROOT`) |
| `frontend.buildPath` | `/` (install + build from monorepo root — FR-007) |
| `preBuild` | enable corepack + activate `pnpm@10.28.2` + `pnpm install --frozen-lockfile` |
| `build` | `typecheck` → `test` → `size` → `build` (gates before build — FR-005) |
| `artifacts.baseDirectory` | `apps/customer-web/.next` |
| `cache.paths` | `node_modules/**/*`, `apps/customer-web/.next/cache/**/*` |

Plus repo-root **`.npmrc`**: `node-linker=hoisted` (D4; whole-monorepo re-verify gate).

---

## E6 — Domain Association (`aws_amplify_domain_association` + Route53 records)

| Field | Value / Rule |
|---|---|
| `domain_name` | `module.dns.zone_name` (dev: `dev.effyshopping.com`); prod: apex `effyshopping.com` |
| `sub_domain[0]` | prefix `""` (apex) → `var.deploy_branch` |
| `sub_domain[1]` | prefix `"www"` → `var.deploy_branch` (redirects to canonical apex — FR-010) |
| `wait_for_verification` | `true` (block until verified — FR-009) |
| Route53 records | ACM validation CNAME + apex ALIAS-A (CloudFront zone `Z2FDTNDATAQYW2`) + `www` CNAME (D6) |
| Reconciliation | REMOVE `edge-domain.tf` `zone_apex_a` / `zone_apex_aaaa`; KEEP `api.` records (FR-012) |
| Certificate | Amplify auto-provisions ACM in `us-east-1` (decision-locked; not created by us) |

---

## E7 — SSM Contract (inputs / outputs)

| Key | Direction | Value |
|---|---|---|
| `/effy/<env>/amplify/github_access_token` | **input** (operator, SecureString) | GitHub token for the connection |
| `/effy/<env>/stripe/publishable_key` | **input** (operator) | Stripe test publishable key |
| `/effy/<env>/posthog/{key,host}` | **input** (operator, optional) | PostHog — blank acceptable |
| `/effy/<env>/web/site_url` | **output** (this slice) | `https://dev.effyshopping.com` — read by edge-customer newsletter |

Details and exact shapes in `contracts/config.contract.md`.
