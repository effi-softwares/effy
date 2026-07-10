# Shop audience — store operators (hidden internal fulfillment nodes); staff-provisioned,
# NO self-signup (FR-003, US3). The client surfaces for the "store" audience are named `shop`
# (shop-mobile + shop-web); the cold-path service serving them is named `store`.
#
# RBAC groups added by 007-shop-web (constitution v1.5.0 — pools MAY define role groups). The
# cognito:groups claim is the ORIGIN of role assignment; the platform's public.store_staff record
# is AUTHORITATIVE for the access decision (role AND status AND store scope). Adding a group is an
# additive, create-only change — it never replaces the pool.

module "shop_pool" {
  source = "../../modules/cognito-user-pool"

  name_prefix                = module.shared.name_prefix
  audience                   = "shop"
  self_signup_enabled        = false
  user_pool_tier             = var.user_pool_tier
  allowed_first_auth_factors = ["EMAIL_OTP"]
  email_configuration        = var.email_configuration
  callback_urls              = try(var.auth_urls["shop"].callback_urls, [])
  logout_urls                = try(var.auth_urls["shop"].logout_urls, [])

  groups = [
    { name = "store_manager", description = "Manages a store: full operator access plus store-level administration." },
    { name = "store_staff", description = "Baseline store operator: day-to-day fulfillment work." },
  ]
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
