# Contract: Config & Infra Inputs/Outputs — 048 consoles

Feature: 048-console-web-cicd. The `/effy/<env>/…` and Terraform-reference inputs the two console
deployments read, and what they touch. Complements `amplify-build.contract.md` (the build/env-var side).

## Operator-supplied inputs (read, never written by this slice)

| Key | Type | Used for | Source |
|---|---|---|---|
| `/effy/<env>/amplify/github_access_token` | SSM SecureString | Amplify↔GitHub connection for both console apps | **Reused from 042** — operator already created it (constitution: Real-World Identifiers). A missing key MUST fail the plan loudly. |

No **new** operator secret is introduced by this slice. (An optional Amplify HTTP basic-auth password
would be a new operator secret — deferred; see plan D10 / spec Assumptions.)

## In-account references (no operator step; drift-free)

| Value | Reference |
|---|---|
| zone root (`dev.effyshopping.com`) | `module.dns.zone_name` |
| shop pool id / web client id | `module.shop_pool.user_pool_id` / `.app_client_id` |
| back-office pool id / web client id | `module.back_office_pool.user_pool_id` / `.app_client_id` |
| deployed edge gateway origin | `https://${var.api_subdomain}.${module.dns.zone_name}` (or `/effy/<env>/edge/api_endpoint`) — same address 042 uses for the cold path |
| alerts SNS topic | `aws_sns_topic.alerts` (037/042) |

## New env-root variables (`infra/envs/dev/variables.tf`)

| Variable | Default | Purpose |
|---|---|---|
| `shop_web_subdomain` | `"shop"` | label → `shop.<zone>` (FR-010/FR-020) |
| `back_office_subdomain` | `"back-office"` | label → `back-office.<zone>` |
| `amplify_consoles_domain_enabled` | `false` | two-stage cutover (stage A builds on the Amplify default hostname; stage B attaches subdomains), mirroring `amplify_domain_enabled` (042) |

Reused (no new declaration): `amplify_repository_url`, `amplify_deploy_branch`, `api_subdomain`,
`aws_account_id`.

## New module variables (`infra/modules/amplify-web-app`) — all defaulted to keep 042 identical

| Variable | Default | This slice passes (consoles) |
|---|---|---|
| `platform` | `"WEB_COMPUTE"` | `"WEB"` (static SPA; no service role — D2) |
| `subdomain_prefix` | `""` (apex) | `"shop"` / `"back-office"` (D4) |
| `custom_rules` | `[]` | one SPA rewrite rule (D3) |

⚠ `service_role_arn` stays as-is; when `platform == "WEB"` the module creates **no** role and sets no
`iam_service_role_arn`. `framework` = `"Web"` for the consoles (vs `"Next.js - SSR"`).

## Outputs (this slice)

| Output | Value |
|---|---|
| `shop_web_app_id` / `back_office_app_id` | each Amplify app id (used by the EventBridge FAILED rule) |
| `shop_web_url` / `back_office_url` | Amplify default hostname pre-cutover; the subdomain after |

No SSM parameter is **published** by this slice (042 already publishes `/effy/<env>/web/site_url` for the
storefront; the consoles need no equivalent public-URL contract — nothing consumes a console URL server-side).

## CORS contract (extends `edge-gateway.tf`)

`allow_origins` becomes the existing localhost origins **plus** the two deployed console origins,
config-derived:

```hcl
# illustrative — the exact local goes in edge-gateway.tf
allow_origins = concat(
  ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
  ["https://${var.shop_web_subdomain}.${module.dns.zone_name}",
   "https://${var.back_office_subdomain}.${module.dns.zone_name}"],
)
```

**Rule**: existing origins preserved (FR-017); added origins derived, not literal (FR-020). `allow_methods`,
`allow_headers`, `expose_headers`, `max_age` unchanged.

## What this slice does NOT touch

- The apex `dev.effyshopping.com` and `api.`/`core-api.` records (FR-012/FR-024).
- The customer-web Amplify app, its `amplify.yml` entry, or `/effy/<env>/web/site_url` (FR-008/SC-010).
- Any Cognito pool or app client (D11 — SDK EMAIL_OTP needs no callback/origin registration; verify live).
- Any backend service logic, the database, or any migration.
