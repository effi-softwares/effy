variable "name_prefix" {
  description = "effy-<env> — the pool is named <name_prefix>-<audience>."
  type        = string
}

variable "audience" {
  description = "Which of the four isolated audiences this pool serves."
  type        = string

  validation {
    condition     = contains(["customer", "driver", "shop", "back_office"], var.audience)
    error_message = "audience must be one of: customer, driver, shop, back_office."
  }
}

variable "self_signup_enabled" {
  description = "true only for customer (FR-002); false sets allow_admin_create_user_only (FR-003)."
  type        = bool
}

variable "user_pool_tier" {
  description = "Cognito feature tier. Passwordless (sign_in_policy) requires ESSENTIALS or PLUS."
  type        = string
  default     = "ESSENTIALS"

  validation {
    condition     = contains(["ESSENTIALS", "PLUS"], var.user_pool_tier)
    error_message = "user_pool_tier must be ESSENTIALS or PLUS — LITE does not support passwordless sign_in_policy (research.md D4)."
  }
}

variable "allowed_first_auth_factors" {
  description = "PASSWORDLESS first-factor methods for the choice-based flow. The module appends the API-mandated PASSWORD entry itself — never pass it (research.md D4)."
  type        = list(string)
  default     = ["EMAIL_OTP"]

  validation {
    condition     = length(var.allowed_first_auth_factors) > 0
    error_message = "At least one first auth factor is required."
  }

  # Still never passed explicitly — the module appends it (the CreateUserPool API refuses to omit
  # it). But the reason has changed: under constitution v1.7.0 the CUSTOMER pool may legitimately
  # OFFER passwords, and the pool-level policy entry is what enables that. Whether a password can
  # actually be USED is decided by the app client's auth flows (var.enable_password_auth), which
  # stays false for driver/shop/admin — so those three remain strictly passwordless.
  validation {
    condition     = alltrue([for f in var.allowed_first_auth_factors : contains(["EMAIL_OTP", "SMS_OTP", "WEB_AUTHN"], f)])
    error_message = "Pass only passwordless factors: EMAIL_OTP, SMS_OTP, WEB_AUTHN. The module appends PASSWORD itself (the API mandates it); to make passwords USABLE, set enable_password_auth = true (customer pool only — constitution v1.7.0, Principle IV)."
  }
}

# --- 011: the customer audience's three credential routes. -------------------------------------
# Every variable below defaults to the pre-011 behaviour, so driver / shop / back_office are
# UNCHANGED by construction: strictly passwordless EMAIL_OTP, admin-provisioned, no IdP, no OAuth.
# Constitution v1.7.0 permits these ONLY on the customer pool.

variable "enable_password_auth" {
  description = "Customer pool ONLY (constitution v1.7.0). Adds ALLOW_USER_SRP_AUTH to the app client, making the PASSWORD/PASSWORD_SRP challenge usable. SRP never puts the password on the wire. The three internal audiences MUST leave this false — they are Effy employees and have no need of a credential that can be stolen or a reset flow that can be attacked."
  type        = bool
  default     = false
}

variable "password_policy" {
  description = "Only meaningful when enable_password_auth = true."
  type = object({
    minimum_length                   = optional(number, 8)
    require_lowercase                = optional(bool, true)
    require_uppercase                = optional(bool, true)
    require_numbers                  = optional(bool, true)
    require_symbols                  = optional(bool, false)
    temporary_password_validity_days = optional(number, 7)
  })
  default = null
}

variable "account_recovery_via_email" {
  description = "Enable ForgotPassword recovery via the VERIFIED email (FR-014). Customer pool only."
  type        = bool
  default     = false
}

variable "google" {
  description = <<-EOT
    Google federated sign-in. CUSTOMER POOL ONLY (constitution v1.7.0); null everywhere else.

    Setting this creates THREE things inside this module — deliberately together, because they are
    inseparable and because splitting them across modules produces a Terraform dependency CYCLE
    (the app client must reference the IdP, the IdP needs the pool, the client lives with the pool):

      1. a Cognito HOSTED DOMAIN — mandatory: there is no pure-SDK federation path (research D15),
         federation is an OAuth redirect through /oauth2/authorize;
      2. the Google identity provider, with `email_verified` MAPPED (a security control — see main.tf);
      3. the OAuth settings on the app client.

    `client_id` / `client_secret` are an OUT-OF-CODE, operator-owned dependency (like the domain
    registrar in 010). Terraform can wire them; it cannot create them.
  EOT
  type = object({
    domain_prefix = string # → <prefix>.auth.<region>.amazoncognito.com (no ACM cert needed)
    client_id     = string
    scopes        = optional(list(string), ["openid", "email", "profile"])
  })
  default = null

  # ⚠ NOT `sensitive = true`, and the secret is carried in a SEPARATE variable below. That split is
  # deliberate, and it was learned the hard way:
  #
  # Marking this whole object sensitive TAINTS EVERY EXPRESSION THAT READS IT. Because the app
  # client's `supported_identity_providers`, `allowed_oauth_flows` and `allowed_oauth_scopes` are all
  # computed from `var.google`, they printed as "(sensitive value)" in `terraform plan` — ON ALL FOUR
  # POOLS, including the ones that pass `null`. It also made a root output containing the (entirely
  # public) hosted-domain name a hard error.
  #
  # An unreadable plan is not a security win. It is a security LOSS: this module's whole safety story
  # is "read the plan, abort if a pool would be replaced", and an operator cannot audit a diff that
  # redacts the very attributes being changed. Nothing here is secret — the domain is a public URL and
  # a Google OAuth client id is public by design. Only the SECRET is secret.
}

variable "google_client_secret" {
  description = "The Google OAuth client secret. Kept OUT of var.google so its sensitivity does not taint the plan output for every attribute computed from it (see the note above). ⚠ Lands in Terraform state — accepted (the state bucket is private + encrypted), but it MUST come from SSM SecureString, never a committed .tfvars."
  type        = string
  default     = null
  sensitive   = true
}

variable "pre_sign_up_lambda_arn" {
  description = "Pre-sign-up trigger. On the customer pool this is the ACCOUNT-LINKING trigger: it links a Google identity into the NATIVE profile so one person is one `sub` (FR-011), and it REFUSES to link unless the IdP asserts a verified email (FR-012) — linking on an unverified email is an account-takeover primitive, not a convenience."
  type        = string
  default     = null
}

variable "writable_attributes" {
  description = <<-EOT
    Standard attributes the app client may write. Set EXPLICITLY, never left implicit.

    ⚠ Leaving it unset does NOT mean "all writable" on an existing client — the provider treats the
    value as computed and simply KEEPS whatever is already there. So a bad value, once applied,
    cannot be undone by deleting the argument; it has to be overwritten. That is precisely how a
    mistaken `write_attributes` that excluded `email` survived a plan that appeared to remove it.

    `email` MUST be present: `SignUp` passes it (it is the username attribute), and Cognito refuses
    any attribute the client cannot write. Excluding it makes REGISTRATION IMPOSSIBLE. The
    email-swap takeover is locked by `require_verification_before_update`, not by this.
  EOT
  type        = list(string)
  default     = null
}

variable "require_verification_before_update" {
  description = <<-EOT
    Attributes a user may change only by PROVING they own the new value. `["email"]` on the customer
    pool.

    ⚠ THIS REPLACED A BROKEN MITIGATION, AND THE REASON MATTERS.

    The threat is real: a signed-in customer who can silently rewrite their own email to a victim's
    address is the well-known Cognito account-takeover. The first attempt at blocking it removed
    `email` from the app client's `write_attributes` — which does stop the swap, and ALSO STOPS
    SIGN-UP: `SignUp` passes `email` as a user attribute (it is the username attribute), and Cognito
    refuses any attribute the client cannot write. It would have made registration impossible — the
    entire point of the surface — to close a hole that AWS provides a purpose-built lock for.

    This is that lock. The customer may still request an email change; Cognito sends a code to the
    NEW address and does not switch the sign-in identity until that code is confirmed. The attacker
    never controls the victim's inbox, so the swap never completes.

    Defence in depth remains: Effy keys `public.customer` on `sub`, never on email.
  EOT
  type        = list(string)
  default     = []
}

variable "groups" {
  description = "RBAC groups to create in this pool. Back-office passes admin/manager/csa; the others pass []."
  type = list(object({
    name        = string
    description = optional(string, "")
  }))
  default = []
}

variable "email_configuration" {
  description = "OTP email delivery. Default: Cognito built-in sender (dev). Higher envs switch to SES: { email_sending_account = \"DEVELOPER\", source_arn = ..., from_email_address = ... } (research.md D6)."
  type = object({
    email_sending_account  = optional(string, "COGNITO_DEFAULT")
    source_arn             = optional(string)
    from_email_address     = optional(string)
    reply_to_email_address = optional(string)
  })
  default = {}
}

variable "callback_urls" {
  description = "App-client OAuth callback URLs (inert until an OAuth flow is enabled; kept for managed login later)."
  type        = list(string)
  default     = []
}

variable "logout_urls" {
  description = "App-client logout URLs."
  type        = list(string)
  default     = []
}

variable "generate_client_secret" {
  description = "false for public clients (mobile/SPA use PKCE)."
  type        = bool
  default     = false
}

variable "access_token_validity_minutes" {
  description = "Access-token lifetime in minutes."
  type        = number
  default     = 60
}

variable "id_token_validity_minutes" {
  description = "Id-token lifetime in minutes."
  type        = number
  default     = 60
}

variable "refresh_token_validity_days" {
  description = "Refresh-token lifetime in days."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Extra tags merged with the provider default_tags."
  type        = map(string)
  default     = {}
}
