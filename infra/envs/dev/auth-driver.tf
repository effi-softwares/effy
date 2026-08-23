# Driver audience — Effy employees; staff-provisioned, NO self-signup (FR-003, US3).
# The SignUp API is structurally rejected; accounts are created by staff (console for now).

module "driver_pool" {
  source = "../../modules/cognito-user-pool"

  name_prefix                = module.shared.name_prefix
  audience                   = "driver"
  self_signup_enabled        = false
  user_pool_tier             = var.user_pool_tier
  allowed_first_auth_factors = ["EMAIL_OTP"]
  email_configuration        = local.pool_email_configuration
  groups                     = []
  callback_urls              = try(var.auth_urls["driver"].callback_urls, [])
  logout_urls                = try(var.auth_urls["driver"].logout_urls, [])

  # --- 035-six-digit-otp -------------------------------------------------------------------------
  # The platform's own SIX-digit sign-in code replaces Cognito's managed EIGHT-digit EMAIL_OTP,
  # whose length is not configurable by any setting on any object.
  #
  # ⚠ `disable_choice_based_auth = true` DROPS ALLOW_USER_AUTH, so the managed 8-digit flow stops
  # being reachable at all on this pool. That is only safe here because this audience has NO
  # self-signup: passwordless `SignUp` is legal only while ALLOW_USER_AUTH is present, which is why
  # the CUSTOMER pool must keep it (035 research R4b).
  #
  # ⚠ The four ARNs are null until `make edge-deploy SERVICE=auth ENV=dev` has run — Cognito
  # validates a trigger on UpdateUserPool, so the functions must exist first. Same two-stage dance
  # as the 011 pre-sign-up trigger.
  # ⚠ BOTH FLAGS ARE DERIVED FROM THE ARNs, NOT HARDCODED — and that is what makes the two-stage
  # apply safe rather than an outage.
  #
  # The auth service's serverless.yml reads SSM parameters that only the FIRST apply creates, so
  # apply must precede deploy. If these were hardcoded `true`, that first apply would flip this
  # pool to ALLOW_CUSTOM_AUTH with NO challenge triggers attached, while simultaneously dropping
  # ALLOW_USER_AUTH — leaving the audience with no working sign-in flow at all until the second
  # apply. On the back-office pool that includes the console an operator would use to fix it.
  #
  # Derived, the sequence is safe at every point:
  #   apply #1 (arns null) → flows UNCHANGED, infra created, sign-in keeps working
  #   deploy               → functions exist
  #   apply #2 (arns set)  → triggers attach AND flows flip, atomically
  enable_custom_auth_flow   = var.custom_auth_lambda_arns != null
  disable_choice_based_auth = var.custom_auth_lambda_arns != null
  custom_auth_lambda_arns   = var.custom_auth_lambda_arns
  # ⚠ 038 — brands Cognito's own four messages on this pool (two-stage; see variables.tf).
  custom_message_lambda_arn = var.custom_message_lambda_arn

}

# App↔infra contract: /effy/dev/auth/driver/{user_pool_id,app_client_id,user_pool_arn}
module "driver_ssm" {
  source = "../../modules/ssm-parameters"

  env           = var.env
  audience      = "driver"
  user_pool_id  = module.driver_pool.user_pool_id
  app_client_id = module.driver_pool.app_client_id
  user_pool_arn = module.driver_pool.user_pool_arn
}

output "driver_user_pool_id" {
  description = "Driver pool id."
  value       = module.driver_pool.user_pool_id
}

output "driver_app_client_id" {
  description = "Driver public app client id."
  value       = module.driver_pool.app_client_id
}

output "driver_user_pool_arn" {
  description = "Driver pool ARN."
  value       = module.driver_pool.user_pool_arn
}

output "driver_user_pool_endpoint" {
  description = "Driver pool issuer host."
  value       = module.driver_pool.user_pool_endpoint
}

# --- 049-driver-mobile-app: dedicated MOBILE app client ------------------------------------------
# The driver KMP app (Android + iOS) signs in against its own public client, mirroring shop_mobile
# (014): passwordless 6-digit EMAIL_OTP only (035 custom challenge), 30-day refresh for the shared
# work device, no SRP, no client secret, COGNITO only. Registered in the driver JWT authorizer's
# audience via edge-gateway.tf so a token from this client is accepted at /driver/v1/*.
resource "aws_cognito_user_pool_client" "driver_mobile" {
  name         = "${module.shared.name_prefix}-driver-mobile-app"
  user_pool_id = module.driver_pool.user_pool_id

  # ⚠ Derived from the ARNs exactly like the module-owned client (see the two-stage note above):
  # offering CUSTOM_AUTH before the challenge triggers exist would leave drivers with no working
  # sign-in between the two applies.
  explicit_auth_flows = var.custom_auth_lambda_arns != null ? [
    "ALLOW_CUSTOM_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"
    ] : [
    "ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  # Public client: PKCE, NO client secret (a secret in a published mobile binary is a leaked secret).
  generate_secret = false

  # Don't leak whether an email is a provisioned driver.
  prevent_user_existence_errors = "ENABLED"

  # COGNITO only — the driver audience has no federation, ever.
  supported_identity_providers = ["COGNITO"]

  # 60-minute access/ID tokens (platform default); 30-DAY refresh — shared-device posture (matches
  # shop_mobile, not the customer app's 90). No hosted-UI callbacks: native EMAIL_OTP uses none.
  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_ssm_parameter" "driver_mobile_app_client_id" {
  name        = "/effy/${var.env}/auth/driver/mobile_app_client_id"
  description = "Driver MOBILE public app client id (049). Separate from the module-owned client so the shared work device holds a 30-day session. EMAIL_OTP only, no SRP."
  type        = "String"
  value       = aws_cognito_user_pool_client.driver_mobile.id
}

output "driver_mobile_app_client_id" {
  description = "Driver MOBILE public app client id (049) — the value for the app's COGNITO_APP_CLIENT_ID."
  value       = aws_cognito_user_pool_client.driver_mobile.id
}
