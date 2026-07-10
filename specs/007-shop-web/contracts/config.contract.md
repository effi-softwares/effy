# Contract — `shop-web` configuration

**Feature**: 007 (FR-017) · **Consumer**: `apps/shop-web` · **Producer**: SSM (the infra↔app
contract) · **Status**: to build this slice.

All values are **build-time `VITE_*`**, **non-secret**, and **per-environment**. No secret or
credential is ever committed or bundled (SC-008). A missing required value fails **loudly at
startup** — the app renders a configuration-error page rather than silently targeting the wrong
environment or, worse, the **wrong identity pool**.

## Required

| Variable | Source (SSM) | Notes |
|---|---|---|
| `VITE_COGNITO_USER_POOL_ID` | `/effy/<env>/auth/shop/user_pool_id` | **shop** pool — not `back-office` |
| `VITE_COGNITO_CLIENT_ID` | `/effy/<env>/auth/shop/app_client_id` | public PKCE client, no secret |
| `VITE_API_BASE_URL` | `/effy/<env>/edge/api_endpoint` | shared gateway host; paths carry `/shop/v1/...` |

Note the SSM slug is **un-hyphenated `shop`**, unlike the back-office console's `back-office`. This
asymmetry is pre-existing (`infra/envs/dev/auth-shop.tf` passes `audience = "shop"`).

## Optional

| Variable | Absent ⇒ |
|---|---|
| `VITE_POSTHOG_KEY` | telemetry is a **no-op**, never a crash |
| `VITE_POSTHOG_HOST` | defaults to `https://us.i.posthog.com` |

## Fail-fast behavior

`createConfig(["VITE_COGNITO_USER_POOL_ID", "VITE_COGNITO_CLIENT_ID", "VITE_API_BASE_URL"])` from
`@effy/web-kit` throws before Amplify is configured. `main.tsx` catches and renders a plain
configuration-error page.

> **The failure mode this guards against**: pasting the back-office pool id into `shop-web`'s
> `.env.local`. Sign-in would *succeed*, and every `/shop/v1/*` call would then return `401` from
> the shop authorizer — a confusing, hard-to-attribute failure. Config is checked for presence, not
> for correctness; the isolation contract is what catches the mix-up, loudly.

## Dev origin (approved, not arbitrary)

`shop-web` runs on **`http://localhost:5174`** (`strictPort: true` — a silent port bump would land
on an unapproved origin and every call would fail CORS).

`5174` **must** be added to the shared gateway's `cors_configuration.allow_origins` in
`infra/envs/dev/edge-gateway.tf` (today: `5173`, `3000`). The gateway owns CORS because a service
attaching to an external HTTP API cannot configure it (A3). This ships in the **same
`make apply ENV=dev`** as the shop pool's role groups — one operator apply, not two.

| Surface | Origin |
|---|---|
| `back-office` | `http://localhost:5173` |
| `shop-web` | `http://localhost:5174` ← new |
| (reserved, `customer-web`) | `http://localhost:3000` |

## `.env.example` (committed; `.env.local` is git-ignored)

```
# Shop web config (VITE_*, build-time, NON-SECRET) — contracts/config.contract.md.
# Copy to .env.local and fill from the 001/004 SSM contract. NEVER commit real values.
VITE_COGNITO_USER_POOL_ID=   # ssm /effy/dev/auth/shop/user_pool_id
VITE_COGNITO_CLIENT_ID=      # ssm /effy/dev/auth/shop/app_client_id
VITE_API_BASE_URL=           # ssm /effy/dev/edge/api_endpoint   (paths carry /shop/v1/...)
# Optional telemetry — degrades to a no-op when absent.
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=
```
