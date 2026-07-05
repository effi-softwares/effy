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

  # ESSENTIALS+ is required for sign_in_policy / passwordless (validated in variables.tf).
  user_pool_tier = var.user_pool_tier

  # Email IS the identity.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Passwordless factors (FR-004) — plus PASSWORD, which the CreateUserPool API refuses
  # to omit ("Password should be configured as one of the allowed first auth factors").
  # No password is actually usable: the app client enables no password flow and no user
  # is ever created with a password credential (research.md D4 amendment).
  sign_in_policy {
    allowed_first_auth_factors = concat(var.allowed_first_auth_factors, ["PASSWORD"])
  }

  # OTP is the first factor, not a second one (data-model.md E3).
  mfa_configuration = "OFF"

  # Self-signup toggle (research.md D5): customer=false here → open signup;
  # driver/shop/back_office=true → the SignUp API is rejected, staff provision users.
  admin_create_user_config {
    allow_admin_create_user_only = !var.self_signup_enabled
  }

  email_configuration {
    email_sending_account  = var.email_configuration.email_sending_account
    source_arn             = var.email_configuration.source_arn
    from_email_address     = var.email_configuration.from_email_address
    reply_to_email_address = var.email_configuration.reply_to_email_address
  }

  tags = var.tags
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

  # Choice-based flow (carries EMAIL_OTP) + refresh. NO password flow is ever enabled.
  explicit_auth_flows = [
    "ALLOW_USER_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  # Public client (mobile/SPA): PKCE, no secret.
  generate_secret = var.generate_client_secret

  # Don't leak whether an email is registered.
  prevent_user_existence_errors = "ENABLED"

  supported_identity_providers = ["COGNITO"]

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
