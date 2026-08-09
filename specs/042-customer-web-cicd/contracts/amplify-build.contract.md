# Contract: Amplify Monorepo Build Spec (`amplify.yml`) + Build Env

Feature: 042-customer-web-cicd

This is the binding contract for how the storefront is built in Amplify. The repo-root `amplify.yml`
overrides any console build settings; if it drifts from this contract, the build behaviour is wrong.

## Repo-root `amplify.yml` (canonical shape)

```yaml
version: 1
applications:
  - appRoot: apps/customer-web            # MUST equal AMPLIFY_MONOREPO_APP_ROOT
    frontend:
      buildPath: '/'                      # install + build from the monorepo root (workspace resolution)
      phases:
        preBuild:
          commands:
            - corepack enable
            - corepack prepare pnpm@10.28.2 --activate
            - pnpm install --frozen-lockfile
        build:
          commands:
            - pnpm --filter @effy/customer-web typecheck
            - pnpm --filter @effy/customer-web test
            - pnpm --filter @effy/customer-web size
            - pnpm --filter @effy/customer-web build
      artifacts:
        baseDirectory: apps/customer-web/.next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
          - apps/customer-web/.next/cache/**/*
```

### Invariants
- **`applications` has length 1.** Adding a second application (any other surface) violates
  FR-006/FR-021. This is the mechanical guarantee that only `customer-web` deploys.
- **`appRoot` == `AMPLIFY_MONOREPO_APP_ROOT`** (env var). Mismatch → "Invalid monorepo spec, no
  appRoot matching path found".
- **Gate order**: `typecheck` → `test` → `size` → `build`. A non-zero exit at any step fails the
  deploy (FR-003/FR-005); the previous version stays live.
- **`buildPath: '/'`**: install runs at repo root so `@effy/*` workspace packages resolve (FR-007).
- Playwright `e2e` is intentionally **absent** (D8) — separate CI, carry-forward.

## Repo-root `.npmrc` (required by Amplify for pnpm/Turborepo)

```
node-linker=hoisted
```

⚠ Affects the **entire** monorepo's install linking. Gate: re-verify the full workspace locally after
adding it (`research.md` D4).

## Build/runtime environment variables (set on the Amplify app, E4)

| Key | Scope | Public in bundle? | Source |
|---|---|---|---|
| `AMPLIFY_MONOREPO_APP_ROOT` | build | n/a | literal `apps/customer-web` |
| `NEXT_PUBLIC_SITE_URL` | build | yes | `https://<zone_name>` |
| `NEXT_PUBLIC_CORE_API_BASE_URL` | build | yes | `https://core-api.<zone_name>` |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | build | yes | `module.customer_pool.user_pool_id` |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | build | yes | `module.customer_pool.app_client_id` |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | build | yes | blank until Google federation |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | build | yes | SSM `/effy/<env>/stripe/publishable_key` |
| `NEXT_PUBLIC_POSTHOG_KEY` | build | yes | SSM (optional) |
| `NEXT_PUBLIC_POSTHOG_HOST` | build | yes | SSM (optional) |
| `EDGE_API_BASE_URL` | runtime | **no** | `https://api.<zone_name>` (or SSM `/effy/<env>/edge/api_endpoint`) |

**Contract rule**: every `NEXT_PUBLIC_*` value MUST be public-safe (it is compiled into browser JS).
No server-only secret may carry the `NEXT_PUBLIC_` prefix (FR-016/SC-007). `REVALIDATE_SECRET` is
**not** set in this slice (D10).
