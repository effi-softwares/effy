variable "domain" {
  description = "The domain to send as — the ENVIRONMENT's namespace (dev.effyshopping.com), never the apex. Dev's sending reputation must stay contained in its own namespace (spec FR-018 / SC-014)."
  type        = string
}

variable "zone_id" {
  description = "Hosted zone id for `domain` — where DKIM/SPF/DMARC records are written."
  type        = string
}

variable "region" {
  description = "Region the SES identity lives in. Must match the Cognito pools' region."
  type        = string
}

variable "dmarc_policy" {
  description = "DMARC policy. Starts at `none` (monitor) ON PURPOSE: `reject` on day one silently destroys ALL sign-in mail on any misconfiguration, and EMAIL_OTP is the only credential this platform issues. Tighten once alignment is observed working."
  type        = string
  default     = "none"

  validation {
    condition     = contains(["none", "quarantine", "reject"], var.dmarc_policy)
    error_message = "dmarc_policy must be one of: none, quarantine, reject."
  }
}

variable "tags" {
  description = "Extra tags. The provider's default_tags already cover the base set."
  type        = map(string)
  default     = {}
}
