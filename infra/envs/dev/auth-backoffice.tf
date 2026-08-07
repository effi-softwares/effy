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
  email_configuration        = local.pool_email_configuration
  callback_urls              = try(var.auth_urls["back_office"].callback_urls, [])
  logout_urls                = try(var.auth_urls["back_office"].logout_urls, [])

  groups = [
    { name = "admin", description = "Full administrative access across the back office." },
    { name = "manager", description = "Operational management: catalog, shops, fulfillment oversight." },
    { name = "csa", description = "Customer service agent: order lookup and customer support actions." },
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
