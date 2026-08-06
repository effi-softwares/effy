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

variable "dmarc_rua" {
  description = "Address that receives this namespace's DMARC aggregate reports. NULL means monitor mode collects nothing — a p=none record with no rua is a record that can never justify tightening (037 FR-017)."
  type        = string
  default     = null
}

variable "configuration_set_name" {
  description = <<-EOT
    Configuration set applied by DEFAULT to mail sent from this identity (037 FR-024/R2).

    ⚠ This is the SAFETY NET half, not the enforcement half. A caller that passes its own
    ConfigurationSetName overrides it, so senders ALSO pass it explicitly — the default exists so a
    caller that forgets is still observed, which is the difference between "our bounce rate is 3%"
    and "THIS person's address is dead".
  EOT
  type        = string
  default     = null
}

variable "tags" {
  description = "Extra tags. The provider's default_tags already cover the base set."
  type        = map(string)
  default     = {}
}
