# Data Model: Internal Console Continuous Deployment (Shop-Web & Back-Office, dev)

Feature: 048-console-web-cicd. Phase 1.

**There is no database and no migration.** The "entities" here are the configuration/deployment objects
this slice creates or extends — the Terraform resource graph and the config contract — exactly as 042.
State lives in Amplify, Route 53/ACM (Amplify-managed), the API-gateway CORS config, SSM, and the
Terraform state, not in Postgres.

---

## E1 — Hosted console application (×2)

The managed Amplify representation of one console. Two instances: shop-web and back-office.

| Field | shop-web | back-office | Notes |
|---|---|---|---|
| name | `effy-dev-shop-web` | `effy-dev-back-office` | `${name_prefix}-<app>` |
| app_root (`AMPLIFY_MONOREPO_APP_ROOT`) | `apps/shop-web` | `apps/back-office` | selects the `amplify.yml` entry (D5); derived from `app_root`, cannot drift |
| platform | `WEB` (static) | `WEB` (static) | **not** `WEB_COMPUTE` (D2) → no service role |
| repository_url | `var.amplify_repository_url` | same | reused from 042 |
| access_token | SSM `/effy/dev/amplify/github_access_token` | same | reused (D7) |
| deploy_branch | `var.amplify_deploy_branch` (`dev`) | same | one branch, all surfaces |
| framework | `Web` | `Web` | Vite SPA hint (not "Next.js - SSR") |
| custom_rules | SPA rewrite (D3) | SPA rewrite (D3) | unknown non-asset path → `/index.html` 200 |
| enable_auto_build | true | true | FR-001 |
| env_vars | VITE_* (E5) | VITE_* (E5) | build-time, public-safe |

**Relationships**: each app → one branch (E2) → one domain association (E3). Independent of the
customer-web app (042) and of each other.

**Rules**: builds **only** its own `app_root` (FR-006/FR-009); is static, so has **no**
`iam_service_role_arn` and creates no role (D2); a failed build leaves its last good version live and
does not touch the other app (FR-003).

---

## E2 — Deployment branch binding

Maps a repository branch to an environment and each console's address.

| Field | Value (dev) | Value (prod, later) |
|---|---|---|
| branch | `dev` | production release branch |
| environment | dev | prod |
| shop-web address | `shop.dev.effyshopping.com` | `shop.effyshopping.com` |
| back-office address | `back-office.dev.effyshopping.com` | `back-office.effyshopping.com` |

**Rules**: only the designated branch auto-deploys (FR-001); per-PR previews out of scope; all values are
parameters (FR-020) so prod is a second instantiation (FR-021).

---

## E3 — Domain association (×2)

Binds a console subdomain to its hosted app, with an Amplify-managed ACM cert (`us-east-1`) and Route 53
record (in-account zone).

| Field | shop-web | back-office | Notes |
|---|---|---|---|
| domain_name (root) | `dev.effyshopping.com` | `dev.effyshopping.com` | the same in-account zone (010) |
| subdomain_prefix | `shop` | `back-office` | new module var; default `""` (apex) keeps 042 |
| enable_www | false | false | consoles have no `www` (apex-only concept) |
| wait_for_verification | true | true | Amplify creates + verifies the record |
| gated by | `var.amplify_consoles_domain_enabled` | same | two-stage cutover (stage A = no domain) |

**Rules**: each subdomain resolves only to its own app (FR-012); this slice does not touch the apex or
`api.`/`core-api.` (FR-012/FR-024). Multiple apps on distinct prefixes of one in-account root is
supported (verify at apply — D4).

---

## E4 — Repo-root `amplify.yml` build spec (extended)

The single monorepo build spec. Now declares **three** `applications[]` entries; each Amplify app builds
only the one matching its `AMPLIFY_MONOREPO_APP_ROOT`.

| appRoot | gates | artifact dir |
|---|---|---|
| `apps/customer-web` (042, unchanged) | typecheck → test → build → size | `apps/customer-web/.next` |
| `apps/shop-web` (new) | typecheck → test → build | `apps/shop-web/dist` |
| `apps/back-office` (new) | typecheck → test → build | `apps/back-office/dist` |

**Rules**: full detail + invariants in `contracts/amplify-build.contract.md`. Adding the two entries does
**not** change customer-web's build (FR-008/SC-010).

---

## E5 — Environment configuration set (per console)

The `VITE_*` values inlined into each console's bundle at build. All public-safe (D8).

| Key | shop-web source | back-office source |
|---|---|---|
| `AMPLIFY_MONOREPO_APP_ROOT` | `apps/shop-web` (from `app_root`) | `apps/back-office` |
| `VITE_COGNITO_USER_POOL_ID` | `module.shop_pool.user_pool_id` | `module.back_office_pool.user_pool_id` |
| `VITE_COGNITO_CLIENT_ID` | `module.shop_pool.app_client_id` | `module.back_office_pool.app_client_id` |
| `VITE_API_BASE_URL` | deployed edge gateway origin | same |
| `VITE_POSTHOG_KEY` / `_HOST` | unset (optional, no-op) | unset |

**Rules**: correct pool per console (Principle IV; D8); every value public-safe — **no secret** in either
bundle (FR-016/FR-018/SC-008).

---

## E6 — Gateway CORS allowlist (extended)

The shared edge gateway's permitted browser origins (`edge-gateway.tf`).

| Origin | Purpose | Status |
|---|---|---|
| `http://localhost:5173` | back-office local dev | kept |
| `http://localhost:5174` | shop-web local dev | kept |
| `http://localhost:3000` | customer-web local dev | kept |
| `https://shop.dev.effyshopping.com` | deployed shop console | **added** |
| `https://back-office.dev.effyshopping.com` | deployed back-office console | **added** |

**Rules**: added origins are config-derived from zone + subdomain vars (FR-020); existing origins
preserved (FR-017). Prod supplies its own zone → its own console origins with no logic edit.

---

## E7 — Build-failure signal (shared)

One EventBridge rule → the existing alerts SNS topic (037/042).

| Field | Value |
|---|---|
| source | `aws.amplify` |
| detail-type | `Amplify Deployment Status Change` |
| detail.jobStatus | `["FAILED"]` |
| detail.appId | `[shop_app_id, back_office_app_id]` |
| target | `aws_sns_topic.alerts` |

**Rules**: reuses 042's SNS topic policy (already grants `events.amazonaws.com` publish); no new
topic/policy (D12; FR-023).

---

## No state transitions

Nothing here has a lifecycle state machine. A build/deploy record is Amplify-managed (running →
succeeded/failed); the platform property is static once applied.
