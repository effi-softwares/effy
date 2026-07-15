# Shop audience — shop operators (hidden internal fulfillment nodes); staff-provisioned,
# NO self-signup (FR-003, US3). It is `shop` everywhere: the client surfaces (shop-mobile +
# shop-web), this pool, its gateway authorizer, and the cold-path service serving them.
#
# RBAC groups added by 007-shop-web (constitution v1.6.0 — pools MAY define role groups). The
# cognito:groups claim is the ORIGIN of role assignment; the platform's public.shop_staff record
# is AUTHORITATIVE for the access decision (role AND status AND shop scope). Adding a group is an
# additive, create-only change — it never replaces the pool.

module "shop_pool" {
  source = "../../modules/cognito-user-pool"

  name_prefix                = module.shared.name_prefix
  audience                   = "shop"
  self_signup_enabled        = false
  user_pool_tier             = var.user_pool_tier
  allowed_first_auth_factors = ["EMAIL_OTP"]
  email_configuration        = local.pool_email_configuration
  callback_urls              = try(var.auth_urls["shop"].callback_urls, [])
  logout_urls                = try(var.auth_urls["shop"].logout_urls, [])

  groups = [
    { name = "shop_manager", description = "Manages a shop: full operator access plus shop-level administration." },
    { name = "shop_staff", description = "Baseline shop operator: day-to-day fulfillment work." },
  ]
}

# ── The shop MOBILE app client (014-shop-mobile-foundation, research D3s) ─────────────────────────
#
# A SECOND app client on the SAME shop pool, for `apps/shop-mobile`. Standalone resource (not baked
# into the module) so the pool and the web client are untouched — this is an ADDITIVE, create-only
# change. STILL READ THE PLAN: if the shop pool shows "must be replaced" / "-/+", ABORT (it would
# destroy the 009-provisioned shop operators).
#
# WHY A SEPARATE CLIENT, not reuse the web one:
#   • Token lifetime is PER-CLIENT. Mobile wants a 30-DAY refresh — a shop's device is a shared
#     WORKPLACE tablet (014 tablet-first), a different threat model from a personal phone, so it gets
#     shop-web's 30 days, NOT the customer app's 90 (research D6s). Sharing a client would couple them.
#   • Independent lifecycle (rotate/disable one surface without the other) + per-surface attribution.
#
# Identity is UNAFFECTED: `sub` is per-POOL, not per-client, so one operator is one record across the
# web and mobile clients alike.
#
# ⚠ MIRRORS customer_mobile (013), MINUS the password flow. The shop audience is strictly passwordless
# EMAIL_OTP (Principle IV): there is NO ALLOW_USER_SRP_AUTH and NO ALLOW_USER_PASSWORD_AUTH here — only
# choice-based USER_AUTH (which carries EMAIL_OTP) + refresh. Adding SRP would hand the pool a password
# capability it must never have; `make verify-pool-credentials` asserts this pool stays passwordless.
#
# ⚠ Its id MUST be added to the shop edge JWT authorizer's audience (edge-gateway.tf) or every mobile
# call 401s — mobile tokens carry THIS client's id as `aud`, and the authorizer pins the audience.
resource "aws_cognito_user_pool_client" "shop_mobile" {
  name         = "${module.shared.name_prefix}-shop-mobile-app"
  user_pool_id = module.shop_pool.user_pool_id

  # EMAIL_OTP only. USER_AUTH carries the choice-based / EMAIL_OTP challenge; refresh keeps sessions.
  # NO SRP / NO USER_PASSWORD — the shop audience has no passwords (Principle IV).
  explicit_auth_flows = ["ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]

  # Public client: PKCE, NO client secret. A secret in a published mobile binary is a LEAKED secret
  # (014 FR-036) — and Amplify's config has no field for one anyway.
  generate_secret = false

  # Don't leak whether an email is a provisioned operator (FR-011).
  prevent_user_existence_errors = "ENABLED"

  # COGNITO only — the shop audience has no federation, ever.
  supported_identity_providers = ["COGNITO"]

  # 60-minute access/ID tokens (the platform default), 30-DAY refresh — the shared-device posture
  # (research D6s), matching shop-web, NOT the customer app's 90. No hosted-UI callbacks: native
  # EMAIL_OTP uses none, and there is no OAuth flow on this client.
  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

# App↔infra contract: /effy/dev/auth/shop/{user_pool_id,app_client_id,user_pool_arn}
module "shop_ssm" {
  source = "../../modules/ssm-parameters"

  env           = var.env
  audience      = "shop"
  user_pool_id  = module.shop_pool.user_pool_id
  app_client_id = module.shop_pool.app_client_id
  user_pool_arn = module.shop_pool.user_pool_arn
}

# App↔infra contract: /effy/<env>/auth/shop/mobile_app_client_id — the shop mobile app reads THIS
# (not the web `app_client_id`) into its COGNITO_APP_CLIENT_ID build config.
resource "aws_ssm_parameter" "shop_mobile_app_client_id" {
  name        = "/effy/${var.env}/auth/shop/mobile_app_client_id"
  description = "Shop MOBILE public app client id (014). Separate from web so the shared workplace device holds a 30-day session (D6s) without changing web's posture. EMAIL_OTP only, no SRP."
  type        = "String"
  value       = aws_cognito_user_pool_client.shop_mobile.id
}

output "shop_user_pool_id" {
  description = "Shop pool id."
  value       = module.shop_pool.user_pool_id
}

output "shop_app_client_id" {
  description = "Shop WEB public app client id."
  value       = module.shop_pool.app_client_id
}

output "shop_mobile_app_client_id" {
  description = "Shop MOBILE public app client id (014) — 30-day refresh, EMAIL_OTP only; the value for the app's COGNITO_APP_CLIENT_ID."
  value       = aws_cognito_user_pool_client.shop_mobile.id
}

output "shop_user_pool_arn" {
  description = "Shop pool ARN."
  value       = module.shop_pool.user_pool_arn
}

output "shop_user_pool_endpoint" {
  description = "Shop pool issuer host."
  value       = module.shop_pool.user_pool_endpoint
}
