# Customer audience: the only pool with self-signup, passwords or federation.
# customer → email code + password, open self-registration (Google built but parked:
# var.customer_google_enabled = false).
# driver / shop / admin → passwordless email code, admin-provisioned.
#
# The pool has lifecycle { prevent_destroy = true }. Read every plan: a pool shown as "must be replaced" /
# "-/+" destroys every account in it, so abort. (Only username_attributes, alias_attributes and
# username_configuration force replacement.)

locals {
  # The customer pool's writable attributes — shared by both app clients (web + mobile, 013) so a
  # customer can register identically on either surface. `email` must stay in the list or SignUp
  # breaks (Cognito refuses attributes a client cannot write); `name` is here for FR-009a.
  customer_writable_attributes = [
    "address", "birthdate", "email", "family_name", "gender", "given_name", "locale",
    "middle_name", "name", "nickname", "phone_number", "picture", "preferred_username",
    "profile", "updated_at", "website", "zoneinfo",
  ]
}

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

  # Makes the password / PASSWORD_SRP challenge usable (adds ALLOW_USER_SRP_AUTH to the app
  # client). SRP means the password never travels over the wire. The three internal pools leave
  # this at its default of false and therefore remain strictly passwordless — asserted on every
  # run by `make verify-pool-credentials`.
  enable_password_auth = true

  # The password policy: 12 characters and no composition rules (NIST SP 800-63B-4: they produce
  # `Password1!` and block passphrases). Breached-password screening, done by the customer service on every
  # path that sets a password, supplies the strength. 12 rather than NIST's 15 is defensible only while breach
  # screening and rate limiting both hold (the emailed code remains the safer route); if either goes, raise
  # it. An in-place update.
  password_policy = {
    minimum_length    = 12
    require_lowercase = false
    require_uppercase = false
    require_numbers   = false
    require_symbols   = false
  }

  # Recovery by proving control of the verified email.
  account_recovery_via_email = true

  # Google federation, parked. `null` disables the federated path: no hosted domain, identity provider or
  # OAuth on the app client; the customer keeps email+password and email code. Everything Google needs (the
  # module's `google` variable, the `email_verified` mapping, the linking trigger, the storefront's OAuth
  # config) is built and dormant. To enable: create the Google OAuth client, put its id/secret in SSM, set
  # `customer_google_enabled = true`, apply, and wire the linking trigger in the same change (without it, an
  # existing customer signing in with Google gets a second account; see `pre_sign_up_lambda_arn`).
  google = var.customer_google_enabled ? {
    domain_prefix = "${module.shared.name_prefix}-customer"
    client_id     = data.aws_ssm_parameter.google_client_id[0].value
  } : null

  # Carried separately so its sensitivity does not taint every plan attribute computed from
  # `google` — see the note on the module's `google` variable. An unreadable plan is a security
  # loss, not a win: this module's safety story is "read the plan, abort if a pool would be
  # replaced", and you cannot audit a diff that redacts what is changing.
  google_client_secret = var.customer_google_enabled ? data.aws_ssm_parameter.google_client_secret[0].value : null

  # `email` is in this list deliberately (see the local). `SignUp` passes it (it is the username
  # attribute) and Cognito refuses any attribute the client cannot write — excluding it blocks the
  # email-swap takeover and blocks registration. Shared with the mobile client so both register alike.
  writable_attributes = local.customer_writable_attributes

  # security — the email-swap takeover, locked. A signed-in customer who can silently rewrite
  # their own email to a victim's address owns that account. Cognito's purpose-built lock: the change
  # is accepted, but a code goes to the new address and the sign-in identity does not move until it
  # is confirmed. The attacker never holds the victim's inbox, so the swap never completes.
  require_verification_before_update = ["email"]

  # the account-linking trigger.
  #
  # Null while Google is parked, and that is correct: the trigger exists only to link a federated
  # identity into the native profile. With no federation there is nothing to link — the password and
  # email-OTP routes both land on the same native profile by construction, because Cognito keys them
  # on the same username (the email). One person, one `sub`, no trigger required.
  #
  # it becomes mandatory the moment google is un-parked. Two-stage by necessity: the Lambda must
  # exist before the pool can reference it — apply, `make edge-deploy SERVICE=customer`, set this to
  # the deployed ARN, apply again. Enabling federation without it gives an existing customer a
  # second account the first time they use Google, and there is no retroactive merge.
  pre_sign_up_lambda_arn = var.customer_pre_sign_up_lambda_arn

  callback_urls = try(var.auth_urls["customer"].callback_urls, [])
  logout_urls   = try(var.auth_urls["customer"].logout_urls, [])

  # The platform's six-digit code, beside this audience's other routes. `disable_choice_based_auth` stays
  # false: passwordless `SignUp` needs ALLOW_USER_AUTH, so dropping it would break self-registration. The
  # managed eight-digit EMAIL_OTP therefore stays reachable by a raw InitiateAuth (no Effy client does it; it
  # is a stronger credential with Cognito's own throttling, a consistency gap rather than an escalation). A
  # throwaway password at sign-up is rejected: set-first-password calls ChangePassword without a previous
  # password. Flows derived from the ARNs, as on the internal pools.
  enable_custom_auth_flow = var.custom_auth_lambda_arns != null
  custom_auth_lambda_arns = var.custom_auth_lambda_arns
  # Brands Cognito's own four messages on this pool (two-stage; see variables.tf).
  custom_message_lambda_arn = var.custom_message_lambda_arn

}

# The customer mobile app's own public client on the customer pool (standalone, so the pool and web client
# are untouched). Separate because token lifetime is per client: mobile keeps a 90-day refresh, web 30
# (possibly a shared computer); it also gives an independent lifecycle and per-surface attribution
# (`client_id`). `sub` is per pool, so one person is one record across both. Its id must be in the customer
# authorizer's audience (edge-gateway.tf), or every mobile call 401s.
resource "aws_cognito_user_pool_client" "customer_mobile" {
  name         = "${module.shared.name_prefix}-customer-mobile-app"
  user_pool_id = module.customer_pool.user_pool_id

  # Identical credential model to the web client (constitution v1.7.0, customer pool):
  # ALLOW_USER_AUTH — EMAIL_OTP + choice-based sign-in
  # ALLOW_USER_SRP_AUTH — password over SRP (the password never travels on the wire)
  # ALLOW_REFRESH_TOKEN_AUTH — sessions
  # Plain ALLOW_USER_PASSWORD_AUTH is deliberately not offered (it would put the password on the wire).
  # Adds ALLOW_CUSTOM_AUTH (the platform's 6-digit code) and retains ALLOW_USER_AUTH
  # passwordless SignUp needs it, so unlike the internal pools this client cannot drop it. See the
  # module block above for the consequence.
  # Derived from the ARNs — see the module block above. ALLOW_USER_AUTH and ALLOW_USER_SRP_AUTH
  # are unconditional here: this audience keeps both its other credential routes.
  explicit_auth_flows = concat(
    var.custom_auth_lambda_arns != null ? ["ALLOW_CUSTOM_AUTH"] : [],
    ["ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"],
  )

  # Public client: Pkce, no client secret. A secret in a published mobile binary is a leaked secret
  # — and Amplify's config has no field for one anyway.
  generate_secret = false

  # Don't leak whether an email is registered.
  prevent_user_existence_errors = "ENABLED"

  # Same writable set as the pool/web client, so registration behaves identically on both surfaces.
  write_attributes = local.customer_writable_attributes

  # Google is parked, same as web. Un-parking adds it here and to the web client in the same change.
  supported_identity_providers = ["COGNITO"]

  # 60-minute access/ID tokens (the platform default), but a 90-DAY refresh — the one setting that
  # differs from web, and the whole reason mobile has its own client. There is NO Cognito
  # inactivity window: this is 90 days from sign-in. Rotation stays off pending spike S4.
  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 90

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # The mobile redirect scheme (already allowlisted in dev.tfvars). Native EMAIL_OTP / password / SRP
  # flows use NO callback; these matter only when Google un-parks, and are kept here so that day is a
  # one-line change rather than a rethink.
  callback_urls = ["effy-customer://auth/callback"]
  logout_urls   = ["effy-customer://signed-out"]
}

# App↔infra contract: /effy/<env>/auth/customer/mobile_app_client_id — the mobile app reads this
# (not the web `app_client_id`) into its COGNITO_APP_CLIENT_ID build config.
resource "aws_ssm_parameter" "customer_mobile_app_client_id" {
  name        = "/effy/${var.env}/auth/customer/mobile_app_client_id"
  description = "Customer MOBILE public app client id (013). Separate from web so the phone can hold a 90-day session (FR-019a) without changing web's posture."
  type        = "String"
  value       = aws_cognito_user_pool_client.customer_mobile.id
}

# The Google OAuth client: operator-owned, outside code. `count` keeps these lookups from running while
# Google is parked (a data source is read on every plan, and the parameters do not exist).
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
  description = "Customer WEB public app client id."
  value       = module.customer_pool.app_client_id
}

output "customer_mobile_app_client_id" {
  description = "Customer MOBILE public app client id (013) — 90-day refresh; the value for the app's COGNITO_APP_CLIENT_ID."
  value       = aws_cognito_user_pool_client.customer_mobile.id
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
