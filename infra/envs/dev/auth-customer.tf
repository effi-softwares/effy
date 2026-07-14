# Customer audience — the ONLY pool open to self-signup, and (from 011) the ONLY pool with
# passwords or federation. Constitution v1.7.0, Principle IV:
#
#   customer               → EMAIL_OTP + PASSWORD + Google. OPEN self-registration.
#   driver / shop / admin  → strictly passwordless EMAIL_OTP, admin-provisioned. UNCHANGED.
#
# ⚠ NON-DESTRUCTIVE BY DESIGN. Every argument added here is an in-place update or a new resource —
# verified against the Terraform AWS provider schema (research D13). The only ForceNew arguments on
# aws_cognito_user_pool are username_attributes, alias_attributes and username_configuration; none
# is touched, and the pool now carries lifecycle { prevent_destroy = true } as a seatbelt.
#
# STILL READ THE PLAN. If any pool shows "must be replaced" / "-/+", ABORT: a replaced pool
# destroys every account in it — the 006 first admin, the 009 shop users, and every customer.

module "customer_pool" {
  source = "../../modules/cognito-user-pool"

  name_prefix                = module.shared.name_prefix
  audience                   = "customer"
  self_signup_enabled        = true
  user_pool_tier             = var.user_pool_tier
  allowed_first_auth_factors = ["EMAIL_OTP"]
  email_configuration        = local.pool_email_configuration
  groups                     = []

  # --- 011: the three credential routes -------------------------------------------------------

  # Makes the PASSWORD / PASSWORD_SRP challenge usable (adds ALLOW_USER_SRP_AUTH to the app
  # client). SRP means the password never travels over the wire. The three INTERNAL pools leave
  # this at its default of false and therefore remain strictly passwordless — asserted on every
  # run by `make verify-pool-credentials`.
  enable_password_auth = true

  password_policy = {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  # FR-014 — recovery by proving control of the VERIFIED email.
  account_recovery_via_email = true

  # Google federation + the Cognito hosted domain it requires. See the module for why the domain
  # is mandatory (there is no pure-SDK federation path) and why `email_verified` must be mapped.
  google = {
    domain_prefix = "${module.shared.name_prefix}-customer"
    client_id     = data.aws_ssm_parameter.google_client_id.value
    client_secret = data.aws_ssm_parameter.google_client_secret.value
  }

  # ⚠ SECURITY — `email` MUST NOT be writable by the app client. A signed-in customer who can
  # rewrite their own email can point it at a victim's address: the well-known Cognito
  # account-takeover. Effy keys its record on `sub`, which blunts it; the attribute is closed
  # anyway. Defence in depth, not either/or.
  unwritable_attributes = ["email"]

  # THE ACCOUNT-LINKING TRIGGER (FR-011/FR-012).
  #
  # ⚠ TWO-STAGE, and it cannot be otherwise: the Lambda must EXIST before the pool can reference
  # it. Leave this null for the first apply, run `make edge-deploy SERVICE=customer ENV=dev`, then
  # set it and apply again. See quickstart.
  #
  # Until it is wired, GOOGLE SIGN-IN CREATES A DUPLICATE ACCOUNT for any customer who already has
  # one — and there is no retroactive merge. Do not test the Google route before this is in place.
  pre_sign_up_lambda_arn = var.customer_pre_sign_up_lambda_arn

  callback_urls = try(var.auth_urls["customer"].callback_urls, [])
  logout_urls   = try(var.auth_urls["customer"].logout_urls, [])
}

# The Google OAuth client — an OUT-OF-CODE, operator-owned dependency, exactly like the domain
# registrar in 010. Terraform can wire it; it cannot create it.
# See specs/011-customer-storefront-web/quickstart.md step 2.
data "aws_ssm_parameter" "google_client_id" {
  name = "/effy/${var.env}/auth/customer/google_client_id"
}

data "aws_ssm_parameter" "google_client_secret" {
  name            = "/effy/${var.env}/auth/customer/google_client_secret"
  with_decryption = true
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

# The storefront's Amplify OAuth config needs the hosted-domain host.
resource "aws_ssm_parameter" "customer_auth_domain" {
  name        = "/effy/${var.env}/auth/customer/domain"
  description = "Cognito hosted domain for the customer pool — required for Google federation (011)."
  type        = "String"
  value       = module.customer_pool.auth_domain_fqdn
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
  description = "Customer pool issuer host (JWT validation pins this)."
  value       = module.customer_pool.user_pool_endpoint
}

output "customer_auth_domain" {
  description = "Cognito hosted domain — the storefront's Amplify oauth.domain, and the host the Google OAuth client must authorize (redirect: https://<this>/oauth2/idpresponse)."
  value       = module.customer_pool.auth_domain_fqdn
}
