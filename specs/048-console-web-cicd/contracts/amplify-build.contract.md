# Contract: Amplify Monorepo Build Spec (`amplify.yml`) — three applications + console env

Feature: 048-console-web-cicd.

This is the binding contract for how the two internal consoles are built in Amplify. It **extends**
042's contract (`specs/042-customer-web-cicd/contracts/amplify-build.contract.md`), which stays the
authority for the `apps/customer-web` entry. The repo-root `amplify.yml` overrides any console-set build
settings; if it drifts from this contract, the build behaviour is wrong.

## Corrected invariant (supersedes 042)

⚠ 042's contract said **"`applications` has length 1"** as the mechanical isolation guarantee. That was
true when one surface existed. The accurate, still-safe rule for a monorepo with multiple hosted apps is:

> **Each Amplify app builds exactly the one `applications[]` entry whose `appRoot` equals that app's
> `AMPLIFY_MONOREPO_APP_ROOT`.** The array may hold one entry per hosted surface; adding an entry does
> not change what any other app builds.

So `applications` now has length **3** (customer-web, shop-web, back-office), and the isolation guarantee
(FR-006/FR-009) is preserved per app, not per file. A mismatched `AMPLIFY_MONOREPO_APP_ROOT` fails loudly
with *"Invalid monorepo spec, no appRoot matching path found"* — it never cross-builds. Update the
`amplify.yml` header comment accordingly.

## Repo-root `amplify.yml` — the two new console entries (canonical shape)

```yaml
version: 1
applications:
  - appRoot: apps/customer-web          # 042 — unchanged (Next SSR; typecheck→test→build→size; .next)
    # …existing 042 block…

  - appRoot: apps/shop-web              # NEW — MUST equal the shop-web app's AMPLIFY_MONOREPO_APP_ROOT
    frontend:
      buildPath: '/'                    # install + build from the monorepo root (workspace resolution, FR-007)
      phases:
        preBuild:
          commands:
            - corepack enable
            - corepack prepare pnpm@10.28.2 --activate
            - pnpm install --frozen-lockfile
        build:
          commands:
            - pnpm --filter @effy/shop-web typecheck
            - pnpm --filter @effy/shop-web test
            - pnpm --filter @effy/shop-web build
      artifacts:
        baseDirectory: apps/shop-web/dist       # Vite output (NOT .next)
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*

  - appRoot: apps/back-office           # NEW — MUST equal the back-office app's AMPLIFY_MONOREPO_APP_ROOT
    frontend:
      buildPath: '/'
      phases:
        preBuild:
          commands:
            - corepack enable
            - corepack prepare pnpm@10.28.2 --activate
            - pnpm install --frozen-lockfile
        build:
          commands:
            - pnpm --filter @effy/back-office typecheck
            - pnpm --filter @effy/back-office test
            - pnpm --filter @effy/back-office build
      artifacts:
        baseDirectory: apps/back-office/dist
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
```

### Invariants (console entries)
- **`appRoot` == that app's `AMPLIFY_MONOREPO_APP_ROOT`.** The module derives the env var from
  `app_root`, so they cannot drift.
- **Gate order**: `typecheck` → `test` → `build`. A non-zero exit at any step fails **that console's**
  deploy (FR-003/FR-005); its previous version stays live; the other apps are untouched.
- **No `size` gate.** The 174 KB bundle budget is customer-web's; the consoles have none (D6). Do not
  copy the storefront's `size` step here.
- **`baseDirectory: apps/<app>/dist`** — Vite output, not `.next`. A wrong directory publishes an empty
  or broken site with a green build.
- **`buildPath: '/'`** — install at repo root so `@effy/{design-system,shared-types,api-client,web-kit}`
  resolve (FR-007).
- Playwright/e2e is **absent** (consistent with 042 D8) — a separate CI concern.

## Repo-root `.npmrc`

Already present from 042 (`node-linker=hoisted`); no change. It governs the whole monorepo's install
linking and is what lets Amplify's pnpm install resolve the workspace — re-confirmed, not re-added.

## Build/runtime environment variables (per console app, E5)

Every value is **build-time** and **public-safe** (Vite inlines `VITE_*` into the browser bundle). There
is **no secret** in either console — unlike the storefront, the consoles carry no publishable key.

| Key | shop-web | back-office | Public in bundle? |
|---|---|---|---|
| `AMPLIFY_MONOREPO_APP_ROOT` | `apps/shop-web` | `apps/back-office` | n/a (build selector) |
| `VITE_COGNITO_USER_POOL_ID` | `module.shop_pool.user_pool_id` | `module.back_office_pool.user_pool_id` | yes |
| `VITE_COGNITO_CLIENT_ID` | `module.shop_pool.app_client_id` | `module.back_office_pool.app_client_id` | yes |
| `VITE_API_BASE_URL` | deployed edge gateway origin | deployed edge gateway origin | yes |
| `VITE_POSTHOG_KEY` | unset (optional) | unset (optional) | yes if set |
| `VITE_POSTHOG_HOST` | unset (optional) | unset (optional) | yes if set |

**Contract rule**: every value here MUST be public-safe (FR-016/FR-018/SC-008). shop-web MUST take the
**shop** pool ids and back-office the **admin/back-office** pool ids — a swap makes sign-in succeed and
every backend call 401 from the mismatched authorizer (Principle IV; D8).

## SPA rewrite (custom rule) — on the Amplify app, not in `amplify.yml`

Set via the module's `custom_rules` (Terraform `aws_amplify_app.custom_rule`), one per console:

```
source = "</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>"
target = "/index.html"
status = "200"
```

**Contract rule**: `status` MUST be `200` (a rewrite, not a redirect) so deep-link URLs are preserved
(FR-011/SC-004). The negative-lookahead list MUST keep real asset extensions serving directly.
