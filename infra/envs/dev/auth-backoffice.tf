# Back-office audience - internal admin staff; staff-provisioned, NO self-signup, and the
# only pool with rbac groups: admin / manager / csa. Groups surface via the
# cognito:groups JWT claim; backend enforcement is a later slice.

module "back_office_pool" {
  source = "../../modules/cognito-user-pool"

  name_prefix                = module.shared.name_prefix
  audience                   = "back_office"
  self_signup_enabled        = false
  user_pool_tier             = var.user_pool_tier
  allowed_first_auth_factors = ["EMAIL_OTP"]
  email_configuration        = local.pool_email_configuration
  callback_urls              = try(var.auth_urls["back_office"].callback_urls, [])
  logout_urls                = try(var.auth_urls["back_office"].logout_urls, [])

  groups = [
    { name = "admin", description = "Full administrative access across the back office." },
    { name = "manager", description = "Operational management: catalog, shops, fulfillment oversight." },
    { name = "csa", description = "Customer service agent: order lookup and customer support actions." },
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
