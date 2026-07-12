variable "env" {
  description = "Environment name — becomes the child namespace label (dev → dev.effyshopping.com)."
  type        = string

  validation {
    condition     = contains(["dev", "qa", "staging", "prod"], var.env)
    error_message = "env must be one of: dev, qa, staging, prod."
  }
}

variable "parent_domain" {
  description = "The platform's registered domain (effyshopping.com)."
  type        = string
}

variable "parent_zone_id" {
  description = "Zone id of the parent, looked up by name in the env root. This module writes EXACTLY ONE record into it: this environment's NS delegation."
  type        = string
}

variable "tags" {
  description = "Extra tags. The provider's default_tags already cover the base set."
  type        = map(string)
  default     = {}
}
