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

  validation {
    condition     = alltrue([for f in var.allowed_first_auth_factors : contains(["EMAIL_OTP", "SMS_OTP", "WEB_AUTHN"], f)])
    error_message = "Allowed factors: EMAIL_OTP, SMS_OTP, WEB_AUTHN. PASSWORD is forbidden platform-wide (constitution Principle IV)."
  }
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
