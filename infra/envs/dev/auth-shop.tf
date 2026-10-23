# Shop audience — shop operators (hidden internal fulfillment nodes); staff-provisioned,
# NO self-signup (FR-003, US3). It is `shop` everywhere: the client (shop-web), this pool, its
# gateway authorizer, and the service serving them.
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
