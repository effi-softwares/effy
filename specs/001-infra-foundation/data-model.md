# Data Model: Infrastructure Foundation & Four-Pool Auth

For an infra slice the "entities" are **Terraform resources, module shapes, and the runtime contract
values** they emit. This maps the spec's Key Entities (Environment, Audience, Identity Pool, Role
Grouping, Provisioning State, Access Profile) onto concrete Terraform constructs. It is descriptive —
exact attributes live in the module/root files; here we fix the shape, relationships, and rules.

---

## E1 — Environment (env root)

One per `infra/envs/<env>/`. The unit of isolation.

| Field | Source | Notes |
|---|---|---|
| `env` | `*.tfvars` (`env = "dev"`) | One of `dev | qa | staging | prod`. Feeds names/tags/SSM prefix. |
| `aws_region` | `*.tfvars` | `dev`=`ap-southeast-1`. The only placement knob (D7). |
| `aws_account_id` | `*.tfvars` | Pinned via provider `allowed_account_ids` (D8). |
| `state key` | `backend.tf` | `envs/<env>/terraform.tfstate` — per-env state isolation (FR-012). |
| `tier` | `*.tfvars` | Cognito `user_pool_tier`; default `ESSENTIALS` (D4). |
| `email_configuration` | `*.tfvars` | `COGNITO_DEFAULT` for dev; SES (`DEVELOPER`) for higher envs (D6). |
| `base_tags` | `_shared` + provider `default_tags` | `Project/Environment/ManagedBy/Slice/Owner` (D9). |

**Relationships**: an Environment **composes** 4 Identity Pools (E3) + 1 SSM contract set (E5).
**Rules**: only `dev` is applied now (FR-011); each root `plan`s independently; no cross-env references.
**State transitions**: `authored → init'd → planned → applied` (dev) | `authored → planned` (qa/staging/prod).

---

## E2 — State backend (bootstrap)

Created once by `infra/bootstrap/` on local state (D2, D3).

| Field | Value / Rule |
|---|---|
| S3 bucket name | `effy-<region-or-global>-tfstate` (globally unique; documented in bootstrap README) |
| Versioning | **Enabled** (rollback/safety) |
| Encryption | Default SSE (SSE-S3 or SSE-KMS) |
| Public access | `BlockPublicAccess` = all true |
| TLS | Bucket policy denies `aws:SecureTransport = false` |
| Locking | **S3-native lockfile** (`use_lockfile = true` in each env backend); **no DynamoDB** |
| Deletion safety | `prevent_destroy = true` on the bucket |

**Relationships**: every Environment (E1) stores its state here under a distinct key.

---

## E3 — Identity Pool (the `cognito-user-pool` module, instantiated ×4 per env)

One module instance per Audience. The slice's central entity.

| Field | Type / Value | Rule |
|---|---|---|
| `audience` | `customer | driver | shop | back_office` | Drives name `effy-<env>-<audience>`. |
| `self_signup_enabled` | bool | `customer=true`, others `false` → `allow_admin_create_user_only` (D5, FR-002/003). |
| `user_pool_tier` | `ESSENTIALS` | Required for passwordless (D4). |
| `username_attributes` | `["email"]` | Email is the identifier. |
| `auto_verified_attributes` | `["email"]` | Needed for OTP delivery. |
| `allowed_first_auth_factors` | `["EMAIL_OTP"]` | Passwordless only (FR-004); set via `sign_in_policy`. |
| `mfa_configuration` | `OFF` | OTP **is** the first factor; not a second factor here. |
| `groups` | list (back_office only) | `["admin","manager","csa"]` (D4/FR-007). Empty for the other three. |
| `email_configuration` | object | `COGNITO_DEFAULT` (dev) or SES (D6). |
| `tags` | map | From env base tags. |

**Outputs**: `user_pool_id`, `user_pool_arn`, `user_pool_endpoint`, `app_client_id(s)`.
**Relationships**: belongs to one Environment; has 1..n App Clients (E4); has 0..n Role Groupings (E6);
its ids flow into the SSM contract (E5).
**Rules**: pools are mutually isolated — no shared client, no cross-pool trust (FR-006, Principle IV).
No password auth flows are ever enabled.

The four instances:

| Instance | self_signup | groups | notes |
|---|---|---|---|
| `customer` | **true** | — | the only self-serve pool (FR-002/FR-005). |
| `driver` | false | — | staff-provisioned (FR-003). |
| `shop` | false | — | staff-provisioned (store/operator). |
| `back_office` | false | `admin, manager, csa` | admin pool + RBAC groups (FR-007). |

---

## E4 — App Client (`aws_cognito_user_pool_client`)

One (or more) per pool, for the surface(s) that authenticate against it.

| Field | Value | Rule |
|---|---|---|
| `explicit_auth_flows` | `["ALLOW_USER_AUTH","ALLOW_REFRESH_TOKEN_AUTH"]` | Choice-based flow carries EMAIL_OTP (D4). **No** `*_PASSWORD_AUTH`. |
| `generate_secret` | `false` (public clients: mobile/SPA) | Public surfaces use PKCE, no secret. |
| `callback_urls` / `logout_urls` | from `*.tfvars` | Per surface; placeholder dev URLs now. |
| `token validity` | sensible defaults (access/id short, refresh longer) | Per-env. |
| `prevent_user_existence_errors` | `ENABLED` | Avoids user-enumeration. |

**Relationships**: belongs to exactly one Identity Pool; its id is published to SSM (E5).

---

## E5 — App↔Infra contract values (SSM Parameter Store)

Written per env by the `ssm-parameters` module (D10). The runtime contract later slices read.

| Parameter (per audience) | Type | Example value |
|---|---|---|
| `/effy/<env>/auth/<audience>/user_pool_id` | String | `ap-southeast-1_ABC123` |
| `/effy/<env>/auth/<audience>/app_client_id` | String | `1h57kf5...` |
| `/effy/<env>/auth/<audience>/user_pool_arn` | String | `arn:aws:cognito-idp:...` |
| `/effy/<env>/region` | String | `ap-southeast-1` |

**Rules**: non-secret (ids aren't secrets) → `String`, no KMS. Naming is the contract — renaming a key
is a breaking change (ARCHITECTURE.md). `<audience>` ∈ {`customer`,`driver`,`shop`,`back-office`}.

---

## E6 — Role Grouping (`aws_cognito_user_group`, back-office only)

| Field | Value |
|---|---|
| `name` | `admin` | `manager` | `csa` |
| `user_pool_id` | back-office pool |
| `description` | human-readable role purpose |

**Rule**: surfaced later via the `cognito:groups` JWT claim (enforcement is a backend slice, not here).

---

## Entity → spec requirement traceability

| Entity | Satisfies |
|---|---|
| E1 Environment | FR-009, FR-010, FR-011, FR-012, FR-019, FR-020, FR-021, FR-022 |
| E2 State backend | FR-009, FR-012, FR-013 |
| E3 Identity Pool | FR-001, FR-002, FR-003, FR-004, FR-006, FR-014 |
| E4 App Client | FR-004, FR-005, FR-008 |
| E5 SSM contract | FR-008 (+ ARCHITECTURE.md infra↔app contract) |
| E6 Role Grouping | FR-007 |
| Guardrails (D8) cross-cut | FR-015, FR-016, FR-017, FR-018 |
