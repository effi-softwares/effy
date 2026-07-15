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

locals {
  # The customer pool's writable attributes — shared by BOTH app clients (web + mobile, 013) so a
  # customer can register identically on either surface. `email` MUST stay in the list or SignUp
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

  # Makes the PASSWORD / PASSWORD_SRP challenge usable (adds ALLOW_USER_SRP_AUTH to the app
  # client). SRP means the password never travels over the wire. The three INTERNAL pools leave
  # this at its default of false and therefore remain strictly passwordless — asserted on every
  # run by `make verify-pool-credentials`.
  enable_password_auth = true

  # --- 012: the password policy, rebuilt on current NIST guidance -------------------------------
  #
  # ⚠ THIS IS A LOOSENING, AND IT IS DELIBERATE. Read before "fixing" it back.
  #
  # It was: 8 characters, with required upper case, lower case and digits. Every one of those
  # composition rules is now gone, because current guidance (NIST SP 800-63B-4) says they are
  # ACTIVELY HARMFUL: they do not produce strong passwords, they produce `Password1!` — a password
  # that satisfies every rule and appears in every breach corpus on earth. They also block the
  # long, memorable passphrases that actually are strong.
  #
  # The strength they pretended to add is picked up FOR REAL by the breached-password screening the
  # pool cannot do, and which the customer service now performs on every path that establishes a
  # password (012 FR-022, research R8).
  #
  # ⚠ 12, NOT NIST'S 15 — a documented deviation. 15 is the guidance for a password used as a SINGLE
  # factor, which Effy's is. It was judged too costly on a storefront where a password is an OPTIONAL
  # convenience in the first place: a customer who finds it onerous can simply keep using the emailed
  # code, which is the safer route anyway.
  #
  # ⚠ THE DEVIATION IS ONLY DEFENSIBLE WHILE BREACH SCREENING AND RATE LIMITING BOTH HOLD. If either
  # is ever removed, this number must go back up. That is not decoration — it is the entire basis on
  # which 12 was chosen over 15.
  #
  # ⚠ IN-PLACE UPDATE. `password_policy` is not a ForceNew argument, so this does NOT replace the
  # pool. STILL READ THE PLAN: if the customer pool shows "must be replaced" / "-/+", ABORT — a
  # replaced pool destroys every account on the platform.
  password_policy = {
    minimum_length    = 12
    require_lowercase = false
    require_uppercase = false
    require_numbers   = false
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

  # ⚠ `email` IS IN THIS LIST DELIBERATELY (see the local). `SignUp` passes it (it is the username
  # attribute) and Cognito refuses any attribute the client cannot write — excluding it blocks the
  # email-swap takeover AND blocks REGISTRATION. Shared with the mobile client so both register alike.
  writable_attributes = local.customer_writable_attributes

  # ⚠ SECURITY — the email-swap takeover, LOCKED. A signed-in customer who can silently rewrite
  # their own email to a victim's address owns that account. Cognito's purpose-built lock: the change
  # is accepted, but a code goes to the NEW address and the sign-in identity does not move until it
  # is confirmed. The attacker never holds the victim's inbox, so the swap never completes.
  require_verification_before_update = ["email"]

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

# ── The customer MOBILE app client (013-customer-mobile-foundation) ──────────────────────────────
#
# A SECOND public app client on the SAME customer pool, for `apps/customer-mobile`. It is a standalone
# resource (not a second client baked into the module) so the pool and the web client are untouched.
#
# WHY A SEPARATE CLIENT, not reuse the web one:
#   • Token lifetime is PER-CLIENT. Mobile wants a 90-day refresh (a phone kept signed in, 013 FR-019a);
#     web keeps its 30-day refresh (a browser, possibly a shared computer). You cannot give mobile 90
#     without dragging web to 90 if they share a client. THIS is the decisive reason.
#   • Independent lifecycle (rotate/disable one surface without breaking the other) and per-surface
#     attribution (the `client_id` claim distinguishes mobile from web traffic).
#
# Identity is UNAFFECTED: `sub` is per-POOL, not per-client, so "one person, one sub, one record" holds
# across both clients — a customer who registered on web signs in on mobile and lands on the same record.
#
# ⚠ Its id MUST be added to the customer edge JWT authorizer's audience (edge-gateway.tf) or every
# mobile call 401s — mobile tokens carry THIS client's id as `aud`, and the authorizer pins the audience.
resource "aws_cognito_user_pool_client" "customer_mobile" {
  name         = "${module.shared.name_prefix}-customer-mobile-app"
  user_pool_id = module.customer_pool.user_pool_id

  # Identical credential model to the web client (constitution v1.7.0, customer pool):
  #   ALLOW_USER_AUTH          — EMAIL_OTP + choice-based sign-in
  #   ALLOW_USER_SRP_AUTH      — password over SRP (the password never travels on the wire)
  #   ALLOW_REFRESH_TOKEN_AUTH — sessions
  # Plain ALLOW_USER_PASSWORD_AUTH is deliberately NOT offered (it would put the password on the wire).
  explicit_auth_flows = ["ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]

  # Public client: PKCE, NO client secret. A secret in a published mobile binary is a LEAKED secret
  # (013 FR-042) — and Amplify's config has no field for one anyway.
  generate_secret = false

  # Don't leak whether an email is registered (FR-016).
  prevent_user_existence_errors = "ENABLED"

  # Same writable set as the pool/web client, so registration behaves identically on both surfaces.
  write_attributes = local.customer_writable_attributes

  # Google is PARKED, same as web. Un-parking adds it here AND to the web client in the same change.
  supported_identity_providers = ["COGNITO"]

  # 60-minute access/ID tokens (the platform default), but a 90-DAY refresh — the ONE setting that
  # differs from web, and the whole reason mobile has its own client (FR-019a). There is NO Cognito
  # inactivity window: this is 90 days from sign-in (research D10). Rotation stays OFF pending spike S4.
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

# App↔infra contract: /effy/<env>/auth/customer/mobile_app_client_id — the mobile app reads THIS
# (not the web `app_client_id`) into its COGNITO_APP_CLIENT_ID build config.
resource "aws_ssm_parameter" "customer_mobile_app_client_id" {
  name        = "/effy/${var.env}/auth/customer/mobile_app_client_id"
  description = "Customer MOBILE public app client id (013). Separate from web so the phone can hold a 90-day session (FR-019a) without changing web's posture."
  type        = "String"
  value       = aws_cognito_user_pool_client.customer_mobile.id
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
