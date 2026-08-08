# Contract: `/effy/<env>/core-api/*` and consumed platform parameters

The app↔infra parameter contract for the hot-path deployment. One new writer; several existing readers.

## Published by this slice (single writer — Principle II)

| Key | Type | Value | Read by |
|---|---|---|---|
| `/effy/<env>/core-api/base_url` | String | `https://core-api.<namespace>` (dev: `https://core-api.dev.effyshopping.com`) | customer-web (SSR + browser base URL), customer-mobile config, operator tooling. Mirrors `/effy/<env>/edge/api_endpoint`. |

Clients MUST read the hot-path base URL from this key, never hard-code the hostname (the alias survives
ALB recreation; the key survives a region move).

## Consumed by this slice (existing contract — reused, not duplicated)

| Key / source | Used for |
|---|---|
| `module.dns.certificate_arn` | ALB HTTPS listener cert (wildcard `*.<namespace>`). |
| `module.dns.zone_id` / `.zone_name` | A/AAAA alias records; hostname composition. |
| `/effy/<env>/db/{endpoint,port,name,master_username}` | Non-secret DB connection parts (`DB_HOST/PORT/NAME/USER`). |
| `/effy/<env>/db/master_secret_arn` → Secrets Manager | `DB_PASSWORD` via `valueFrom` JSON-key `:password::`. |
| `/effy/<env>/stripe/secret_key` (Secrets Manager) | `STRIPE_SECRET_KEY` via `valueFrom`. |
| `/effy/<env>/stripe/webhook_secret` (Secrets Manager) | `STRIPE_WEBHOOK_SECRET` via `valueFrom`. |
| `/effy/<env>/media/bucket` | `AWS_MEDIA_BUCKET`; task-role `s3:GetObject` ARN. |
| customer pool id + web/mobile client ids (this root's cognito resources) | `AUTH_CUSTOMER_POOL_ID`, `AUTH_CUSTOMER_CLIENT_ID`. |
| `var.aws_region` | `AWS_REGION`; region is config, never a literal. |

## Failure posture (constitution: Real-World Identifiers)

- A **missing required** consumed value (DB parts, secret ARNs, media bucket, pool/client ids) MUST make
  `terraform plan`/`apply` or task start **fail loudly** — never default to a guess.
- No new outward-facing identifier is introduced. The hostname derives from the approved namespace;
  mail/reply/endpoint contracts are untouched by this slice.

## Terraform variables (dev defaults; the promotion knobs)

| Variable | Dev default | Prod value |
|---|---|---|
| `core_api_subdomain` | `"core-api"` | `"core-api"` (namespace differs → apex) |
| `core_api_image_tag` | `"latest"` | immutable git-sha |
| `core_api_cpu` / `core_api_memory` | `256` / `512` | same unless load requires |
| `core_api_desired_count` | `1` | `1` (no autoscaling either way) |
| `core_api_cors_origins` | customer-web dev origin(s) + `http://localhost:3000` | prod storefront origin |
| `core_api_assign_public_ip` | `true` (public subnets, no NAT) | `false` (private subnets + NAT/endpoints) |
| `core_api_subnet_ids` | default-VPC public subnets | prod private subnets |
