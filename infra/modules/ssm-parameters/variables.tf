variable "env" {
  description = "Environment segment of the parameter path: /effy/<env>/auth/..."
  type        = string

  validation {
    condition     = contains(["dev", "qa", "staging", "prod"], var.env)
    error_message = "env must be one of: dev, qa, staging, prod."
  }
}

variable "audience" {
  description = "Audience segment of the parameter path — HYPHENATED form per the contract (back-office, not back_office)."
  type        = string

  validation {
    condition     = contains(["customer", "driver", "shop", "back-office"], var.audience)
    error_message = "audience must be one of: customer, driver, shop, back-office (hyphenated path form)."
  }
}

variable "user_pool_id" {
  description = "The audience's Cognito user pool id."
  type        = string
}

variable "app_client_id" {
  description = "The audience's public app client id."
  type        = string
}

variable "user_pool_arn" {
  description = "The audience's user pool ARN."
  type        = string
}

variable "tags" {
  description = "Extra tags merged with the provider default_tags."
  type        = map(string)
  default     = {}
}
