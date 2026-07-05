# Back-office audience — internal admin staff; staff-provisioned, NO self-signup, and the
# ONLY pool with RBAC groups: admin / manager / csa (FR-007, US3). Groups surface via the
# cognito:groups JWT claim; backend enforcement is a later slice.

module "back_office_pool" {
  source = "../../modules/cognito-user-pool"

  name_prefix                = module.shared.name_prefix
  audience                   = "back_office"
  self_signup_enabled        = false
  user_pool_tier             = var.user_pool_tier
  allowed_first_auth_factors = ["EMAIL_OTP"]
  email_configuration        = var.email_configuration
  callback_urls              = try(var.auth_urls["back_office"].callback_urls, [])
  logout_urls                = try(var.auth_urls["back_office"].logout_urls, [])

  groups = [
    { name = "admin", description = "Full administrative access across the back office." },
    { name = "manager", description = "Operational management: catalog, stores, fulfillment oversight." },
    { name = "csa", description = "Customer service agent: order lookup and customer support actions." },
  ]
}

# App↔infra contract (hyphenated path form per the SSM contract):
# /effy/dev/auth/back-office/{user_pool_id,app_client_id,user_pool_arn}
module "back_office_ssm" {
  source = "../../modules/ssm-parameters"

  env           = var.env
  audience      = "back-office"
  user_pool_id  = module.back_office_pool.user_pool_id
  app_client_id = module.back_office_pool.app_client_id
  user_pool_arn = module.back_office_pool.user_pool_arn
}

output "back_office_user_pool_id" {
  description = "Back-office pool id."
  value       = module.back_office_pool.user_pool_id
}

output "back_office_app_client_id" {
  description = "Back-office public app client id."
  value       = module.back_office_pool.app_client_id
}

output "back_office_user_pool_arn" {
  description = "Back-office pool ARN."
  value       = module.back_office_pool.user_pool_arn
}

output "back_office_user_pool_endpoint" {
  description = "Back-office pool issuer host."
  value       = module.back_office_pool.user_pool_endpoint
}
