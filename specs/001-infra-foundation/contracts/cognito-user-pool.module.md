# Contract: `modules/cognito-user-pool`

The single reusable interface for one audience's identity pool. Instantiated **four times** per env
root. Modules never call other modules (ARCHITECTURE.md) — this one only declares resources and emits
outputs the env root composes.

## Inputs (variables)

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `name_prefix` | string | yes | — | `effy-<env>` — used to name the pool `${name_prefix}-${audience}`. |
| `audience` | string | yes | — | `customer | driver | shop | back_office`. |
| `self_signup_enabled` | bool | yes | — | `true` only for customer; sets `allow_admin_create_user_only = !self_signup_enabled`. |
| `user_pool_tier` | string | no | `"ESSENTIALS"` | `LITE | ESSENTIALS | PLUS`. Must be `ESSENTIALS`+ for EMAIL_OTP. |
| `allowed_first_auth_factors` | list(string) | no | `["EMAIL_OTP"]` | PASSWORDLESS first-factor methods. The module appends the API-mandated `PASSWORD` entry itself — callers must never pass it (unusable: no password flow or credential exists; research.md D4 amendment). |
| `groups` | list(object({name,description})) | no | `[]` | Back-office passes `admin/manager/csa`; others `[]`. |
| `email_configuration` | object | no | `{ email_sending_account = "COGNITO_DEFAULT" }` | SES fields optional for higher envs. |
| `callback_urls` | list(string) | no | `[]` | App-client OAuth callback URLs. |
| `logout_urls` | list(string) | no | `[]` | App-client logout URLs. |
| `generate_client_secret` | bool | no | `false` | Public clients (mobile/SPA) ⇒ false (PKCE). |
| `tags` | map(string) | no | `{}` | Merged with provider `default_tags`. |

## Behaviour (invariants the module guarantees)

- Pool is created on the requested tier; `sign_in_policy.allowed_first_auth_factors` is set ⇒ requires
  `ESSENTIALS`+ (validated; plan fails otherwise).
- The pool-level factor list is `var.allowed_first_auth_factors + ["PASSWORD"]` — the Cognito API
  refuses to omit PASSWORD. It is inert: no password flow is enabled on any client and no user ever
  holds a password credential (research.md D4 amendment).
- `username_attributes = ["email"]`, `auto_verified_attributes = ["email"]`.
- App client `explicit_auth_flows = ["ALLOW_USER_AUTH","ALLOW_REFRESH_TOKEN_AUTH"]` — **no password
  flow** is ever enabled.
- `allow_admin_create_user_only = !self_signup_enabled`.
- `prevent_user_existence_errors = "ENABLED"`.
- Groups are created **only** when `groups` is non-empty.

## Outputs

| Name | Description |
|---|---|
| `user_pool_id` | e.g. `ap-southeast-1_ABC123`. |
| `user_pool_arn` | Pool ARN. |
| `user_pool_endpoint` | Issuer host (per-pool JWT validation will pin this later). |
| `app_client_id` | The (public) app client id. |
| `app_client_ids` | Map if multiple clients are added later. |

## Consumed by

The env root (`envs/<env>/main.tf`) wires these outputs into the `ssm-parameters` module (E5) and the
root `outputs.tf`. No other module reads them directly.
