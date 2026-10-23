# Shop audience: shop operators, staff-provisioned, no self-signup. `shop` everywhere: the client
# (shop-web), this pool, its authorizer and its service. RBAC groups: `cognito:groups` is where a role is
# assigned; `public.shop_staff` decides access (role, status, shop scope). Adding a group never replaces the
# pool.

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

  # The platform's own six-digit code replaces Cognito's managed eight-digit EMAIL_OTP (whose length
  # nothing configures). `disable_choice_based_auth = true` drops ALLOW_USER_AUTH, so the managed flow is
  # unreachable here; safe only because this audience has no self-signup (the customer pool must keep it).
  #
  # The four ARNs are null until `make edge-deploy SERVICE=auth ENV=dev` has run (Cognito validates a
  # trigger on UpdateUserPool), and both flags are derived from them, so the two-stage apply is safe at every
  # point:
  # apply #1 (arns null) → flows unchanged, infra created, sign-in keeps working
  # deploy → functions exist
  # apply #2 (arns set) → triggers attach and flows flip, atomically
  # Hardcoded `true` would leave the pool on ALLOW_CUSTOM_AUTH with no triggers after apply #1: no sign-in at
  # all.
  enable_custom_auth_flow   = var.custom_auth_lambda_arns != null
  disable_choice_based_auth = var.custom_auth_lambda_arns != null
  custom_auth_lambda_arns   = var.custom_auth_lambda_arns
  # Brands Cognito's own four messages on this pool (two-stage; see variables.tf).
  custom_message_lambda_arn = var.custom_message_lambda_arn

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
  description = "Shop WEB public app client id."
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
