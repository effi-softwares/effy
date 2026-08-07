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
# UNCHANGED by construction: strictly passwordless email one-time code, admin-provisioned, no IdP,
# no OAuth. (⚠ 035 changed WHO ISSUES that code — the platform, not Cognito's managed EMAIL_OTP
# factor — via enable_custom_auth_flow / disable_choice_based_auth below. The credential is the
# same; its length is now six digits everywhere.)
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

variable "custom_auth_lambda_arns" {
  description = <<-EOT
    The four 035 sign-in-code triggers, or null to leave the pool on Cognito's managed EMAIL_OTP.

    Set on ALL FOUR pools once 035 rolls out — this is what replaces the managed 8-digit code with
    the platform's own 6-digit one (spec 035 FR-002).

    ⚠ The functions are SHARED across the four pools (one deployment, branching on
    `event.userPoolId`), but each pool grants its own `aws_lambda_permission` — four per pool,
    sixteen in total, no wildcards. See specs/035-six-digit-otp/research.md § R8.

    ⚠ ORDERING: the Lambdas must be deployed BEFORE these ARNs are set. Cognito validates the
    trigger on UpdateUserPool, so a not-yet-deployed ARN fails the apply.
  EOT
  type = object({
    define              = string
    create              = string
    verify              = string
    post_authentication = string
  })
  default = null
}

variable "custom_message_lambda_arn" {
  description = <<-EOT
    The 038 CustomMessage trigger, or null to leave Cognito's own default templates in place.

    Brands the four messages Cognito sends itself (sign-up confirmation, password reset, email
    verification, MFA). The Lambda RENDERS the platform design and returns HTML; Cognito substitutes
    the code and sends. It never throws — a throw fails the whole sign-up/recovery operation — so a
    render failure returns the event unmodified and Cognito falls back to its default.

    ⚠ Shared across all four pools (one deployment, branching on `event.userPoolId`); each pool grants
    its own `aws_lambda_permission`. ⚠ ORDERING: deploy the Lambda BEFORE setting this ARN — Cognito
    validates the trigger on UpdateUserPool. Setting it is an IN-PLACE update (lambda_config is not
    ForceNew), but read the plan anyway (035 FR-030): a replaced pool destroys every account.
  EOT
  type        = string
  default     = null
}

variable "enable_custom_auth_flow" {
  description = <<-EOT
    Adds ALLOW_CUSTOM_AUTH to the app client, making the platform's own 6-digit sign-in code
    reachable (035).

    ⚠ THIS DOES NOT REMOVE ALLOW_USER_AUTH — see `disable_choice_based_auth`. Both flows coexist by
    design during rollout, which is what makes a per-surface rollback a client-side constant change
    rather than a Terraform apply (FR-033).
  EOT
  type        = bool
  default     = false
}

variable "disable_choice_based_auth" {
  description = <<-EOT
    Drops ALLOW_USER_AUTH from the app client, so Cognito's MANAGED 8-digit EMAIL_OTP flow is no
    longer reachable at all.

    ⚠ SET THIS TRUE ONLY ON POOLS WITH NO SELF-SIGNUP (driver / shop / back-office). Passwordless
    `SignUp` — omitting the password entirely — is only legal while "passwordless sign-in is active
    in your user pool AND app client", which means ALLOW_USER_AUTH. The customer pool must keep it,
    which is why the managed 8-digit path stays reachable there by raw API until spike T003 settles
    whether a sign-up-only app client closes it (research R4b).

    ⚠ The alternative — planting a random throwaway password at sign-up — was REJECTED: it breaks
    012's set-first-password flow, which calls ChangePassword WITHOUT PreviousPassword and only
    works on an account that has no password.
  EOT
  type        = bool
  default     = false
}

variable "auth_session_validity_minutes" {
  description = <<-EOT
    Lifetime of the Session token BETWEEN challenge round trips. Valid range 3-15.

    ⚠ THIS IS NOT THE CODE TTL. Cognito refreshes it on every round trip, so it cannot express
    "this code dies five minutes after issue" — that is enforced from the issued-at timestamp
    inside the verify trigger (035 FR-008). Setting it BELOW 5 would expire the session before a
    shopper's third attempt.
  EOT
  type        = number
  default     = 5

  validation {
    condition     = var.auth_session_validity_minutes >= 3 && var.auth_session_validity_minutes <= 15
    error_message = "Cognito permits 3-15 minutes. Do not go below 5: the third attempt would be cut off (035 research R5)."
  }
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
    # 037: attributes Cognito's own mail to a configuration set, so its sends produce per-message
    # delivery outcomes like the platform's own do. ⚠ Inert under COGNITO_DEFAULT.
    configuration_set = optional(string)
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
