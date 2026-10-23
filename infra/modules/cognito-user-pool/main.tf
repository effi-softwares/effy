# One audience's isolated identity pool + its (public) app client — instantiated four
# times per env root (customer / driver / shop / back_office). Passwordless EMAIL_OTP
# via Cognito's managed choice-based flow on the Essentials tier (research.md D4);
# no passwords, ever (035 added the custom-auth Lambda triggers — see lambda_config below).

locals {
  # audience "back_office" → resource names "effy-<env>-back-office"
  audience_slug = replace(var.audience, "_", "-")
  pool_name     = "${var.name_prefix}-${local.audience_slug}"
}

resource "aws_cognito_user_pool" "this" {
  name = local.pool_name

  # A replaced pool destroys every account in it — the 006 first admin, the 009 shop users,
  # and (from 011) every customer who has ever signed up. The only ForceNew arguments on this
  # resource are username_attributes, alias_attributes and username_configuration.case_sensitive;
  # none of them are ever changed. This is the seatbelt for the day someone tries.
  lifecycle {
    prevent_destroy = true
  }

  # essentials+ is required for sign_in_policy / passwordless (validated in variables.tf).
  user_pool_tier = var.user_pool_tier

  # Email IS the identity. ForceNew — never change this.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Passwordless factors, plus password, which CreateUserPool refuses to omit. This entry does not decide
  # whether passwords exist: only an app client with ALLOW_USER_SRP_AUTH (var.enable_password_auth) can run a
  # password challenge, and only the customer pool sets it.
  sign_in_policy {
    allowed_first_auth_factors = concat(var.allowed_first_auth_factors, ["PASSWORD"])
  }

  # the email-swap takeover, locked (customer pool).
  #
  # A signed-in customer who can silently rewrite their own email to a victim's address is the
  # well-known Cognito account-takeover. This is aws's purpose-built lock: the change is accepted,
  # but Cognito emails a code to the new address and does not switch the sign-in identity until that
  # code is confirmed. The attacker never controls the victim's inbox, so the swap never completes.
  #
  # (The earlier attempt — removing `email` from the client's write_attributes — also blocked the
  # swap, and also blocked sign-up: `SignUp` passes `email`, and Cognito refuses any attribute the
  # client cannot write. It made registration impossible in order to close a hole that has a lock.)
  dynamic "user_attribute_update_settings" {
    for_each = length(var.require_verification_before_update) == 0 ? [] : [1]
    content {
      attributes_require_verification_before_update = var.require_verification_before_update
    }
  }

  # OTP is the first factor, not a second one (data-model.md E3).
  # Cognito forbids MFA together with passwordless — do not turn this on.
  mfa_configuration = "OFF"

  # Self-signup toggle (research.md D5): customer → open signup (the only audience that may
  # self-register); driver/shop/back_office → the SignUp API is rejected, staff provision users.
  admin_create_user_config {
    allow_admin_create_user_only = !var.self_signup_enabled
  }

  # Password rules — only meaningful where a password can exist at all (the customer pool).
  dynamic "password_policy" {
    for_each = var.password_policy == null ? [] : [var.password_policy]
    content {
      minimum_length                   = password_policy.value.minimum_length
      require_lowercase                = password_policy.value.require_lowercase
      require_uppercase                = password_policy.value.require_uppercase
      require_numbers                  = password_policy.value.require_numbers
      require_symbols                  = password_policy.value.require_symbols
      temporary_password_validity_days = password_policy.value.temporary_password_validity_days
    }
  }

  # Recover the account by proving control of the verified email.
  dynamic "account_recovery_setting" {
    for_each = var.account_recovery_via_email ? [1] : []
    content {
      recovery_mechanism {
        name     = "verified_email"
        priority = 1
      }
    }
  }

  # Lambda triggers: `pre_sign_up` (account linking; customer only) and the four challenge /
  # `post_authentication` entries (the platform's six-digit code, on all four pools). Cognito validates a
  # trigger on UpdateUserPool, so the functions must exist before an ARN is set:
  # apply (null) → `make edge-deploy SERVICE=auth` → set the ARNs in dev.tfvars → apply again.
  # `lambda_config` is an in-place update; read the plan anyway (a replaced pool destroys every account).
  dynamic "lambda_config" {
    for_each = (
      var.pre_sign_up_lambda_arn == null &&
      var.custom_auth_lambda_arns == null &&
      var.custom_message_lambda_arn == null
    ) ? [] : [1]
    content {
      pre_sign_up = var.pre_sign_up_lambda_arn

      define_auth_challenge          = try(var.custom_auth_lambda_arns.define, null)
      create_auth_challenge          = try(var.custom_auth_lambda_arns.create, null)
      verify_auth_challenge_response = try(var.custom_auth_lambda_arns.verify, null)
      post_authentication            = try(var.custom_auth_lambda_arns.post_authentication, null)

      # Brands Cognito's own four messages. Null leaves Cognito's defaults untouched.
      custom_message = var.custom_message_lambda_arn
    }
  }

  email_configuration {
    email_sending_account  = var.email_configuration.email_sending_account
    source_arn             = var.email_configuration.source_arn
    from_email_address     = var.email_configuration.from_email_address
    reply_to_email_address = var.email_configuration.reply_to_email_address
    configuration_set      = var.email_configuration.configuration_set
  }

  tags = var.tags
}

# Cognito must be permitted to invoke the linking trigger.
resource "aws_lambda_permission" "pre_sign_up" {
  count = var.pre_sign_up_lambda_arn == null ? 0 : 1

  statement_id  = "AllowCognitoInvoke-${local.pool_name}"
  action        = "lambda:InvokeFunction"
  function_name = var.pre_sign_up_lambda_arn
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.this.arn
}

# Cognito must be permitted to invoke each custom-auth trigger, on this pool.
#
# one permission per (function, pool) — four here, sixteen across the four pools. The functions
# are shared, so a single wildcard `source_arn` would work and is exactly what not to do: it would
# silently admit any pool created later, including one nobody reviewed. The blast radius stays
# explicit and greppable (Principle IV, Principle VI).
resource "aws_lambda_permission" "custom_auth" {
  for_each = var.custom_auth_lambda_arns == null ? {} : {
    define              = var.custom_auth_lambda_arns.define
    create              = var.custom_auth_lambda_arns.create
    verify              = var.custom_auth_lambda_arns.verify
    post_authentication = var.custom_auth_lambda_arns.post_authentication
  }

  statement_id  = "AllowCognitoInvoke-${local.pool_name}-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = each.value
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.this.arn
}

# Cognito must be permitted to invoke the 038 CustomMessage trigger, on this pool.
# One per pool, no wildcard — same discipline as the custom-auth permissions above.
resource "aws_lambda_permission" "custom_message" {
  count = var.custom_message_lambda_arn == null ? 0 : 1

  statement_id  = "AllowCognitoInvoke-${local.pool_name}-custom-message"
  action        = "lambda:InvokeFunction"
  function_name = var.custom_message_lambda_arn
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.this.arn
}

# --- Google federation (customer pool only) ----------------------------------------------------
#
# These live inside this module on purpose. The app client must list "Google" in
# supported_identity_providers, the IdP needs the pool's id, and the client ships with the pool
# so hosting the IdP in a sibling module makes Terraform see module ↔ module circularity and it
# refuses to plan ("Cycle:..."). Keeping them together lets the dependency resolve at resource
# granularity, which is what it actually is: pool → domain → idp → client.

# A prefix domain. A custom domain (auth.dev.effyshopping.com) is CloudFront-fronted and would
# require an ACM certificate in us-east-1 regardless of the platform's region — the same carve-out
# claude.md records for 010. The prefix domain needs no certificate and costs nothing.
resource "aws_cognito_user_pool_domain" "this" {
  count = var.google == null ? 0 : 1

  domain       = var.google.domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_identity_provider" "google" {
  count = var.google == null ? 0 : 1

  user_pool_id  = aws_cognito_user_pool.this.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google.client_id
    client_secret    = var.google_client_secret
    authorize_scopes = join(" ", var.google.scopes)
  }

  # `email_verified` IS A security control, not a convenience mapping. 
  #
  # The pre-sign-up trigger links a Google identity into an existing native profile by matching on
  # email. If Google's `email_verified` claim is not mapped through, the trigger cannot tell a
  # proven address from an unproven one — and "link on email match" becomes an account-takeover
  # primitive:
  #
  # an attacker registers victim@example.com at a provider that does not verify ownership,
  # federates in, the trigger matches the email, links the attacker's identity into the victim's
  # profile — and the attacker now receives JWTs carrying the victim's `sub`. No password. No
  # OTP. Nothing in any log that looks like an attack.
  #
  # AWS: "it is critical that [AdminLinkProviderForUser] only be used with external IdPs and
  # provider attributes that have been trusted by the application owner."
  #
  # Losing this mapping also locks customers out of password recovery, because Cognito will not
  # send a reset code to an address it believes is unverified. Do not remove it.
  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    username       = "sub"
    given_name     = "given_name"
    family_name    = "family_name"
  }
}

# rbac groups — only the back-office pool passes any (admin / manager / csa, FR-007).
# Surfaced later via the cognito:groups JWT claim; enforcement is a backend slice.
resource "aws_cognito_user_group" "this" {
  for_each = { for g in var.groups : g.name => g }

  name         = each.value.name
  description  = each.value.description
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_user_pool_client" "this" {
  name         = "${local.pool_name}-app"
  user_pool_id = aws_cognito_user_pool.this.id

  # the password decision lives here, not in the pool's sign_in_policy.
  #
  # ALLOW_USER_AUTH — choice-based flow; carries EMAIL_OTP. All four pools.
  # ALLOW_USER_SRP_AUTH — makes the password/PASSWORD_SRP challenge usable. Customer only
  # (constitution v1.7.0). SRP means the password never goes on the
  # wire. Plain ALLOW_USER_PASSWORD_AUTH is deliberately not offered.
  # ALLOW_REFRESH_TOKEN_AUTH — sessions.
  #
  # Driver / shop / back_office get exactly the two they always had.
  #
  # Adds ALLOW_CUSTOM_AUTH — the platform's own 6-digit code. On pools with no self-signup it
  # also drops ALLOW_USER_AUTH, so Cognito's managed 8-digit EMAIL_OTP stops being reachable at all.
  # The customer pool cannot drop it: passwordless SignUp is only legal while it is present.
  explicit_auth_flows = concat(
    var.disable_choice_based_auth ? [] : ["ALLOW_USER_AUTH"],
    ["ALLOW_REFRESH_TOKEN_AUTH"],
    var.enable_password_auth ? ["ALLOW_USER_SRP_AUTH"] : [],
    var.enable_custom_auth_flow ? ["ALLOW_CUSTOM_AUTH"] : [],
  )

  # not the code TTL — see the variable's own note. 5 is the floor that still allows three
  # attempts; below it the session dies before the shopper's last try.
  auth_session_validity = var.auth_session_validity_minutes

  # Public client (mobile/SPA/SSR): Pkce, no secret.
  generate_secret = var.generate_client_secret

  # Don't leak whether an email is registered.
  prevent_user_existence_errors = "ENABLED"

  # explicit, on purpose. Leaving this unset does not reset it — the provider keeps whatever the
  # client already has, so a bad value survives its own removal. `email` must be in the list or
  # sign-up breaks (Cognito refuses attributes the client cannot write, and SignUp passes email).
  write_attributes = var.writable_attributes

  # Google is added here for the customer pool only. There is NO pure-SDK federation path — Cognito
  # federation is an OAuth redirect through the hosted domain above.
  #
  # Referencing the IdP resource (rather than the literal string "Google") is what tells Terraform
  # the client must be created after it — AWS rejects a client that names a provider which does not
  # yet exist.
  supported_identity_providers = var.google == null ? ["COGNITO"] : concat(
    ["COGNITO"],
    [aws_cognito_identity_provider.google[0].provider_name],
  )

  allowed_oauth_flows_user_pool_client = var.google != null
  # Authorization-code + pkce. A public client has no secret, so the implicit flow is never offered.
  allowed_oauth_flows  = var.google == null ? null : ["code"]
  allowed_oauth_scopes = var.google == null ? null : var.google.scopes

  callback_urls = length(var.callback_urls) > 0 ? var.callback_urls : null
  logout_urls   = length(var.logout_urls) > 0 ? var.logout_urls : null

  access_token_validity  = var.access_token_validity_minutes
  id_token_validity      = var.id_token_validity_minutes
  refresh_token_validity = var.refresh_token_validity_days

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}
