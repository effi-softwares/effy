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
