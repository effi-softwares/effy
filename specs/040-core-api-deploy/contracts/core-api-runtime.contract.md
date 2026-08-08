# Contract: Core-API Runtime (container ↔ platform)

The interface between the running core-api container and the platform. Binding for the module, the env
wrapper, and the app's config loader.

## Container

- **Image**: built from `apis/core-api/Dockerfile`, `runtime` stage (distroless static, nonroot).
- **Architecture**: **linux/arm64** (Fargate ARM64). A non-arm64 image MUST fail the deploy (health
  never green) — build with `docker buildx build --platform linux/arm64` (FR-015).
- **Listening port**: **8080** (`EXPOSE 8080`; container reads `PORT`, default 8080).
- **User**: nonroot (image default). No shell in the image (composition of config is in-process).

## Health endpoints (already implemented — `internal/platform/health/handler.go`)

| Path | Meaning | Used by |
|---|---|---|
| `GET /healthz` | Liveness — process is up. Returns 200. | **ALB target-group health check** (the traffic gate). |
| `GET /readyz` | Readiness — dependencies reachable. | Operator diagnostics / quickstart only. **Not** the LB gate (R9). |

Both are excluded from request logging already (`httpx/logging.go`).

## Environment the container consumes

Non-secret (`environment`) and secret (`secrets`/`valueFrom`) — see data-model.md § 2 for the full
table and sources. Summary:

- **Non-secret**: `EFFY_ENV`, `PORT`, `AWS_REGION`, `LOG_LEVEL`, `CORS_ALLOWED_ORIGINS`,
  `AWS_MEDIA_BUCKET`, `AUTH_CUSTOMER_POOL_ID`, `AUTH_CUSTOMER_CLIENT_ID`, `DB_HOST`, `DB_PORT`,
  `DB_NAME`, `DB_USER`.
- **Secret (injected at task start)**: `DB_PASSWORD`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

### DSN resolution rule (the one app change)

```
if DB_DSN is set and non-empty:        use DB_DSN verbatim        # local `make core-run`
else:                                  require DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
                                       compose: host=… port=… dbname=… user=… password=… sslmode=require connect_timeout=10
                                       any missing part → fail at start-up (never a silent wrong connection)
```

The composed string MUST match the shape produced by `infra/scripts/db-dsn.sh` (proven by unit test).
Neither `DB_DSN`, `DB_PASSWORD`, nor the composed DSN is ever logged.

## AWS identity used at runtime (task role)

The SDK inside the container resolves the **task role** (no `AWS_PROFILE` in the cloud). It may call:

- `s3:GetObject` on the product-media bucket (presigned-GET signing / existence checks).
- Public endpoints needing no IAM: Cognito JWKS (JWT validation), Stripe API (payments).

## Traffic & security posture

- Public clients reach the service **only** via the ALB on **443** (80 redirects to 443). The container
  port **8080 is reachable only from the ALB security group** — never from the public internet (FR-019).
- CORS: the app honours `CORS_ALLOWED_ORIGINS` for browser callers (customer-web). Native mobile and
  SSR need no CORS.
- `idle_timeout = 120 s` at the ALB accommodates checkout round-trips (FR-010).
