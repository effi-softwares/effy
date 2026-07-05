variable "env" {
  description = "Environment name — feeds naming, tags, and the SSM path prefix."
  type        = string

  validation {
    condition     = contains(["dev", "qa", "staging", "prod"], var.env)
    error_message = "env must be one of: dev, qa, staging, prod."
  }
}

variable "aws_region" {
  description = "Region all of this env's resources are placed in. The single relocation knob (FR-019/FR-020)."
  type        = string
}

variable "aws_account_id" {
  description = "Target AWS account id (12 digits) — pinned via provider allowed_account_ids (research.md D8)."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be the 12-digit AWS account id — set the real value in this env's .tfvars."
  }
}

variable "user_pool_tier" {
  description = "Cognito feature tier for all four pools. ESSENTIALS is the passwordless minimum; prod may opt up to PLUS via tfvars."
  type        = string
  default     = "ESSENTIALS"
}

variable "email_configuration" {
  description = "OTP email delivery for all four pools. dev: COGNITO_DEFAULT built-in sender. Higher envs switch to SES (DEVELOPER + source_arn) when promoted (research.md D6)."
  type = object({
    email_sending_account  = optional(string, "COGNITO_DEFAULT")
    source_arn             = optional(string)
    from_email_address     = optional(string)
    reply_to_email_address = optional(string)
  })
  default = {}
}

variable "auth_urls" {
  description = "Per-audience app-client callback/logout URLs (dev placeholders for now). Keys: customer, driver, shop, back_office."
  type = map(object({
    callback_urls = list(string)
    logout_urls   = list(string)
  }))
  default = {}
}
