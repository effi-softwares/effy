# modules/cognito-user-pool

One audience's isolated Cognito user pool + public app client, passwordless **EMAIL_OTP**
(managed choice-based flow, Essentials tier — no Lambda triggers, no passwords). Instantiated
**four times** per env root: `customer`, `driver`, `shop`, `back_office`.

Full interface contract: [specs/001-infra-foundation/contracts/cognito-user-pool.module.md](../../../specs/001-infra-foundation/contracts/cognito-user-pool.module.md).

## Invariants

- `sign_in_policy.allowed_first_auth_factors` — callers pass passwordless factors only
  (`PASSWORD` is rejected by validation, constitution Principle IV); the module appends the
  **API-mandated** `PASSWORD` entry itself (CreateUserPool refuses a list without it). It is
  inert: no password flow is enabled and no user ever holds a password credential
  (research.md D4 amendment). Tier must be `ESSENTIALS`+ (validated).
- `username_attributes = ["email"]`, `auto_verified_attributes = ["email"]`.
- App client: `ALLOW_USER_AUTH` + `ALLOW_REFRESH_TOKEN_AUTH` only — no password flow, no secret
  (public clients use PKCE), `prevent_user_existence_errors = ENABLED`.
- `allow_admin_create_user_only = !self_signup_enabled` — only the customer pool passes `true`.
- Groups are created only when `groups` is non-empty (back-office: `admin`/`manager`/`csa`).

## Example

```hcl
module "customer_pool" {
  source              = "../../modules/cognito-user-pool"
  name_prefix         = module.shared.name_prefix # effy-dev
  audience            = "customer"
  self_signup_enabled = true
  user_pool_tier      = var.user_pool_tier
  email_configuration = var.email_configuration
}
```

This module never calls other modules; the env root wires its outputs into
`modules/ssm-parameters` (ARCHITECTURE.md).
