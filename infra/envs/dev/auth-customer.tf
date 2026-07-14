# Customer audience — the ONLY pool open to self-signup, and (from 011) the ONLY pool with
# passwords or federation. Constitution v1.7.0, Principle IV:
#
#   customer               → EMAIL_OTP + PASSWORD. OPEN self-registration.
#                            (Google is BUILT but PARKED — var.customer_google_enabled = false.)
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

  # Google federation — PARKED (2026-07-14, operator decision).
  #
  # `null` disables the whole federated path: no Cognito hosted domain, no identity provider, no
  # OAuth on the app client. The customer keeps TWO credential routes (email+password, email OTP),
  # both of which are pure-SDK and need no external dependency.
  #
  # This is deliberately a FLAG, not a deletion. Everything Google needs — the module's `google`
  # variable, the `email_verified` security mapping, the linking trigger, the storefront's OAuth
  # config and callback — is built, tested and dormant. Turning it on is: create the Google OAuth
  # client, put its id/secret in SSM, set `customer_google_enabled = true`, apply.
  #
  # ⚠ WHEN IT IS UN-PARKED, THE LINKING TRIGGER MUST BE WIRED IN THE SAME BREATH. Without it, a
  # customer who already has an account and then signs in with Google gets a SECOND account, and
  # there is no retroactive merge. See `pre_sign_up_lambda_arn` below and quickstart § 3.
  google = var.customer_google_enabled ? {
    domain_prefix = "${module.shared.name_prefix}-customer"
    client_id     = data.aws_ssm_parameter.google_client_id[0].value
  } : null

  # Carried separately so its sensitivity does not taint every plan attribute computed from
  # `google` — see the note on the module's `google` variable. An unreadable plan is a security
  # loss, not a win: this module's safety story is "read the plan, abort if a pool would be
  # replaced", and you cannot audit a diff that redacts what is changing.
  google_client_secret = var.customer_google_enabled ? data.aws_ssm_parameter.google_client_secret[0].value : null

  # ⚠ SECURITY — `email` MUST NOT be writable by the app client. A signed-in customer who can
  # rewrite their own email can point it at a victim's address: the well-known Cognito
  # account-takeover. Effy keys its record on `sub`, which blunts it; the attribute is closed
  # anyway. Defence in depth, not either/or.
  unwritable_attributes = ["email"]

  # THE ACCOUNT-LINKING TRIGGER (FR-011/FR-012).
  #
  # Null while Google is parked, and that is correct: the trigger exists ONLY to link a FEDERATED
  # identity into the native profile. With no federation there is nothing to link — the password and
  # email-OTP routes both land on the same native profile by construction, because Cognito keys them
  # on the same username (the email). One person, one `sub`, no trigger required.
  #
  # ⚠ IT BECOMES MANDATORY THE MOMENT GOOGLE IS UN-PARKED. Two-stage by necessity: the Lambda must
  # exist before the pool can reference it — apply, `make edge-deploy SERVICE=customer`, set this to
  # the deployed ARN, apply again. Enabling federation WITHOUT it gives an existing customer a
  # SECOND account the first time they use Google, and there is no retroactive merge.
  pre_sign_up_lambda_arn = var.customer_pre_sign_up_lambda_arn

  callback_urls = try(var.auth_urls["customer"].callback_urls, [])
  logout_urls   = try(var.auth_urls["customer"].logout_urls, [])
}

# The Google OAuth client — an OUT-OF-CODE, operator-owned dependency, exactly like the domain
# registrar in 010. Terraform can wire it; it cannot create it.
#
# `count` is what makes parking Google actually work: with the feature off these lookups do not run
# at all. Left ungated they would FAIL THE APPLY, because the parameters do not exist — a data
# source is read on every plan whether or not anything consumes it.
data "aws_ssm_parameter" "google_client_id" {
  count = var.customer_google_enabled ? 1 : 0
  name  = "/effy/${var.env}/auth/customer/google_client_id"
}

data "aws_ssm_parameter" "google_client_secret" {
  count           = var.customer_google_enabled ? 1 : 0
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
#
# Only exists when Google does — the domain IS the federation mechanism. The storefront treats an
# absent domain as "federation is not offered" and simply does not render the Google button, so a
# missing parameter is a supported state, not a broken one.
resource "aws_ssm_parameter" "customer_auth_domain" {
  count       = var.customer_google_enabled ? 1 : 0
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
  description = "Cognito hosted domain — the storefront's Amplify oauth.domain, and the host the Google OAuth client must authorize (redirect: https://<this>/oauth2/idpresponse). NULL while Google is parked."
  value       = module.customer_pool.auth_domain_fqdn
}
