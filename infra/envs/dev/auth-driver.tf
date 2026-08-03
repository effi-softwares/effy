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
  enable_custom_auth_flow   = true
  disable_choice_based_auth = true
  custom_auth_lambda_arns   = var.custom_auth_lambda_arns

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
