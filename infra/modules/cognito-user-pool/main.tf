# One audience's isolated identity pool + its (public) app client — instantiated four
# times per env root (customer / driver / shop / back_office). Passwordless EMAIL_OTP
# via Cognito's managed choice-based flow on the Essentials tier (research.md D4);
# no Lambda triggers, no passwords, ever.

locals {
  # audience "back_office" → resource names "effy-<env>-back-office"
  audience_slug = replace(var.audience, "_", "-")
  pool_name     = "${var.name_prefix}-${local.audience_slug}"
}

resource "aws_cognito_user_pool" "this" {
  name = local.pool_name

  # ⚠ A REPLACED POOL DESTROYS EVERY ACCOUNT IN IT — the 006 first admin, the 009 shop users,
  # and (from 011) every customer who has ever signed up. The only ForceNew arguments on this
  # resource are username_attributes, alias_attributes and username_configuration.case_sensitive;
  # none of them are ever changed. This is the seatbelt for the day someone tries.
  lifecycle {
    prevent_destroy = true
  }

  # ESSENTIALS+ is required for sign_in_policy / passwordless (validated in variables.tf).
  user_pool_tier = var.user_pool_tier

  # Email IS the identity. ⚠ ForceNew — never change this.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Passwordless factors — plus PASSWORD, which the CreateUserPool API refuses to omit
  # ("Password should be configured as one of the allowed first auth factors").
  #
  # ⚠ 011 / constitution v1.7.0: this pool-level entry is identical on all four pools and always
  # has been — it is NOT what decides whether passwords exist. That decision is made at the APP
  # CLIENT: only a client carrying ALLOW_USER_SRP_AUTH (var.enable_password_auth) can run a
  # password challenge at all. Driver / shop / back_office leave it false and therefore stay
  # strictly passwordless, exactly as before 011. Only the customer pool sets it true.
  sign_in_policy {
    allowed_first_auth_factors = concat(var.allowed_first_auth_factors, ["PASSWORD"])
  }

  # ⚠ THE EMAIL-SWAP TAKEOVER, LOCKED (customer pool).
  #
  # A signed-in customer who can silently rewrite their own email to a victim's address is the
  # well-known Cognito account-takeover. This is AWS's purpose-built lock: the change is accepted,
  # but Cognito emails a code to the NEW address and does NOT switch the sign-in identity until that
  # code is confirmed. The attacker never controls the victim's inbox, so the swap never completes.
  #
  # (The earlier attempt — removing `email` from the client's write_attributes — also blocked the
  # swap, and ALSO BLOCKED SIGN-UP: `SignUp` passes `email`, and Cognito refuses any attribute the
  # client cannot write. It made registration impossible in order to close a hole that has a lock.)
  dynamic "user_attribute_update_settings" {
    for_each = length(var.require_verification_before_update) == 0 ? [] : [1]
    content {
      attributes_require_verification_before_update = var.require_verification_before_update
    }
  }

  # OTP is the first factor, not a second one (data-model.md E3).
  # ⚠ Cognito forbids MFA together with passwordless — do not turn this on.
  mfa_configuration = "OFF"

  # Self-signup toggle (research.md D5): customer → OPEN signup (the only audience that may
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

  # FR-014 — recover the account by proving control of the VERIFIED email.
  dynamic "account_recovery_setting" {
    for_each = var.account_recovery_via_email ? [1] : []
    content {
      recovery_mechanism {
        name     = "verified_email"
        priority = 1
      }
    }
  }

  # The ACCOUNT-LINKING trigger (011, FR-011/FR-012). Null on every pool but customer.
  dynamic "lambda_config" {
    for_each = var.pre_sign_up_lambda_arn == null ? [] : [var.pre_sign_up_lambda_arn]
    content {
      pre_sign_up = lambda_config.value
    }
  }

  email_configuration {
    email_sending_account  = var.email_configuration.email_sending_account
    source_arn             = var.email_configuration.source_arn
    from_email_address     = var.email_configuration.from_email_address
    reply_to_email_address = var.email_configuration.reply_to_email_address
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

# --- Google federation (customer pool only) ----------------------------------------------------
#
# ⚠ These live INSIDE this module on purpose. The app client must list "Google" in
# supported_identity_providers, the IdP needs the pool's id, and the client ships with the pool —
# so hosting the IdP in a sibling module makes Terraform see module ↔ module circularity and it
# refuses to plan ("Cycle: ..."). Keeping them together lets the dependency resolve at RESOURCE
# granularity, which is what it actually is: pool → domain → idp → client.

# A PREFIX domain. A CUSTOM domain (auth.dev.effyshopping.com) is CloudFront-fronted and would
# require an ACM certificate in us-east-1 regardless of the platform's region — the same carve-out
# CLAUDE.md records for 010. The prefix domain needs no certificate and costs nothing.
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

  # ⚠⚠ `email_verified` IS A SECURITY CONTROL, NOT A CONVENIENCE MAPPING. ⚠⚠
  #
  # The pre-sign-up trigger links a Google identity into an existing native profile by matching on
  # email. If Google's `email_verified` claim is not mapped through, the trigger cannot tell a
  # proven address from an unproven one — and "link on email match" becomes an ACCOUNT-TAKEOVER
  # PRIMITIVE:
  #
  #   an attacker registers victim@example.com at a provider that does not verify ownership,
  #   federates in, the trigger matches the email, links the attacker's identity into the victim's
  #   profile — and the attacker now receives JWTs CARRYING THE VICTIM'S `sub`. No password. No
  #   OTP. Nothing in any log that looks like an attack.
  #
  # AWS: "it is critical that [AdminLinkProviderForUser] only be used with external IdPs and
  # provider attributes that have been trusted by the application owner."
  #
  # Losing this mapping ALSO locks customers out of password recovery, because Cognito will not
  # send a reset code to an address it believes is unverified. Do not remove it.
  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    username       = "sub"
    given_name     = "given_name"
    family_name    = "family_name"
  }
}

# RBAC groups — only the back-office pool passes any (admin / manager / csa, FR-007).
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

  # THE PASSWORD DECISION LIVES HERE, not in the pool's sign_in_policy.
  #
  #   ALLOW_USER_AUTH        — choice-based flow; carries EMAIL_OTP. All four pools.
  #   ALLOW_USER_SRP_AUTH    — makes the PASSWORD/PASSWORD_SRP challenge usable. CUSTOMER ONLY
  #                            (constitution v1.7.0). SRP means the password never goes on the
  #                            wire. Plain ALLOW_USER_PASSWORD_AUTH is deliberately NOT offered.
  #   ALLOW_REFRESH_TOKEN_AUTH — sessions.
  #
  # Driver / shop / back_office get exactly the two they always had.
  explicit_auth_flows = concat(
    ["ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    var.enable_password_auth ? ["ALLOW_USER_SRP_AUTH"] : [],
  )

  # Public client (mobile/SPA/SSR): PKCE, no secret.
  generate_secret = var.generate_client_secret

  # Don't leak whether an email is registered.
  prevent_user_existence_errors = "ENABLED"

  # ⚠ EXPLICIT, on purpose. Leaving this unset does not reset it — the provider keeps whatever the
  # client already has, so a bad value survives its own removal. `email` MUST be in the list or
  # SIGN-UP BREAKS (Cognito refuses attributes the client cannot write, and SignUp passes email).
  write_attributes = var.writable_attributes

  # Google is added here for the customer pool ONLY. There is NO pure-SDK federation path — Cognito
  # federation is an OAuth redirect through the hosted domain above (research D15).
  #
  # Referencing the IdP resource (rather than the literal string "Google") is what tells Terraform
  # the client must be created AFTER it — AWS rejects a client that names a provider which does not
  # yet exist.
  supported_identity_providers = var.google == null ? ["COGNITO"] : concat(
    ["COGNITO"],
    [aws_cognito_identity_provider.google[0].provider_name],
  )

  allowed_oauth_flows_user_pool_client = var.google != null
  # Authorization-code + PKCE. A public client has no secret, so the implicit flow is never offered.
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
