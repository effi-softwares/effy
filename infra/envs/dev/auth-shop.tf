# Shop audience — store operators (hidden internal fulfillment nodes); staff-provisioned,
# NO self-signup (FR-003, US3). The mobile surface for the "store" audience is named `shop`.

module "shop_pool" {
  source = "../../modules/cognito-user-pool"

  name_prefix                = module.shared.name_prefix
  audience                   = "shop"
  self_signup_enabled        = false
  user_pool_tier             = var.user_pool_tier
  allowed_first_auth_factors = ["EMAIL_OTP"]
  email_configuration        = var.email_configuration
  groups                     = []
  callback_urls              = try(var.auth_urls["shop"].callback_urls, [])
  logout_urls                = try(var.auth_urls["shop"].logout_urls, [])
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

output "shop_user_pool_id" {
  description = "Shop pool id."
  value       = module.shop_pool.user_pool_id
}

output "shop_app_client_id" {
  description = "Shop public app client id."
  value       = module.shop_pool.app_client_id
}

output "shop_user_pool_arn" {
  description = "Shop pool ARN."
  value       = module.shop_pool.user_pool_arn
}

output "shop_user_pool_endpoint" {
  description = "Shop pool issuer host."
  value       = module.shop_pool.user_pool_endpoint
}
