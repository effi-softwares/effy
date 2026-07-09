# Contract — Back-Office Web Config (`VITE_*`, build-time, non-secret)

**Feature**: 005 · **Consumer**: `apps/back-office` · **Date**: 2026-07-08

Per-environment configuration for the console. Every value is **non-secret** (a public Cognito
client, a public API URL, a public analytics key). Values are supplied to the **Vite build/dev**
as `VITE_*` environment variables; a missing **required** value fails boot fast, naming the key
(`lib/amplify.ts`), and no value is ever committed (`.env.example` carries names only). No secret
(DB password, app-client secret, AWS credential) exists in this surface at all.

## Required

| Key | Meaning | Source (dev) | Required |
|---|---|---|---|
| `VITE_COGNITO_USER_POOL_ID` | Admin Cognito pool id (AWS region encoded in the `<region>_xxxx` prefix — no separate region var). | 001 SSM `/effy/dev/auth/back-office/user_pool_id` | ✅ |
| `VITE_COGNITO_CLIENT_ID` | Admin **public** app-client id (no client secret — the 001 client is secretless). | 001 SSM `/effy/dev/auth/back-office/app_client_id` | ✅ |
| `VITE_API_BASE_URL` | Shared edge gateway host; paths carry `/admin/v1/...` (004 A3). | 004 SSM `/effy/dev/edge/api_endpoint` | ✅ |

## Optional (telemetry — degrades to no-op if absent)

| Key | Meaning | Source |
|---|---|---|
| `VITE_POSTHOG_KEY` | PostHog project API key (public, write-only ingestion key). | PostHog project |
| `VITE_POSTHOG_HOST` | PostHog ingestion host. | PostHog project |

## Rules

- **Fail-fast**: the three required keys are validated at boot; a missing/empty one aborts with a
  message naming the key (FR-014) — never a silent mis-target of an environment.
- **Non-secret only**: if a value would be a secret, it does not belong here. Cross-check: the
  app-client is public (001 `README` — "no secret"); the DB is never reached from the web tier.
- **Operator retrieval (dev)**:
  ```bash
  aws ssm get-parameter --name /effy/dev/auth/back-office/user_pool_id   --query Parameter.Value --output text
  aws ssm get-parameter --name /effy/dev/auth/back-office/app_client_id  --query Parameter.Value --output text
  # VITE_API_BASE_URL: from `make edge-deploy SERVICE=admin ENV=dev` output (or the API Gateway console).
  ```
  These land in `apps/back-office/.env.local` (git-ignored) for local runs. Hosted deployment
  (a later slice) will inject them at build time via the hosting pipeline.

## CORS coupling (edge-api side, not a web var)

The console's dev origin `http://localhost:5173` must be an allowed CORS origin at the
**Terraform-owned shared gateway** (`infra/envs/dev/edge-gateway.tf` `cors_configuration.allow_origins`,
A3 — admin-ping.contract.md D2) — otherwise every backend call is refused. This is a Terraform/
operator `terraform apply` concern (already live), **not** a per-service setting or a `VITE_*` value.
