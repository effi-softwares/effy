# Customer audience — the ONLY pool with self-signup enabled (FR-002, US2).
# Passwordless EMAIL_OTP; a new email can self-register and sign in with an OTP.

module "customer_pool" {
  source = "../../modules/cognito-user-pool"

  name_prefix                = module.shared.name_prefix
  audience                   = "customer"
  self_signup_enabled        = true
  user_pool_tier             = var.user_pool_tier
  allowed_first_auth_factors = ["EMAIL_OTP"]
  email_configuration        = local.pool_email_configuration
  groups                     = []
  callback_urls              = try(var.auth_urls["customer"].callback_urls, [])
  logout_urls                = try(var.auth_urls["customer"].logout_urls, [])
}

# App↔infra contract: /effy/dev/auth/customer/{user_pool_id,app_client_id,user_pool_arn}
module "customer_ssm" {
  source = "../../modules/ssm-parameters"

  env           = var.env
  audience      = "customer"
  user_pool_id  = module.customer_pool.user_pool_id
  app_client_id = module.customer_pool.app_client_id
  user_pool_arn = module.customer_pool.user_pool_arn
}

output "customer_user_pool_id" {
  description = "Customer pool id."
  value       = module.customer_pool.user_pool_id
}

output "customer_app_client_id" {
  description = "Customer public app client id."
  value       = module.customer_pool.app_client_id
}

output "customer_user_pool_arn" {
  description = "Customer pool ARN."
  value       = module.customer_pool.user_pool_arn
}

output "customer_user_pool_endpoint" {
  description = "Customer pool issuer host (JWT validation pins this later)."
  value       = module.customer_pool.user_pool_endpoint
}
