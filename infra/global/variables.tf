variable "aws_region" {
  description = "Region for this root's API calls. Route 53 is GLOBAL — a hosted zone has no region (010 research R2) — but the provider still needs one."
  type        = string
  default     = "ap-southeast-2"
}

variable "aws_account_id" {
  description = "Target AWS account id (12 digits) — pinned via provider allowed_account_ids."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be exactly 12 digits."
  }
}

variable "root_domain" {
  description = "The platform's registered domain. Registrar (GoDaddy) delegates authority to the zone this root creates."
  type        = string
  default     = "effyshopping.com"
}

# ── 037-platform-email-delivery: the apex's mail identity ─────────────────────────────────────
# The apex does not SEND automated mail — the environments do, from their own namespaces. What it
# does is host the operator's human mailbox (workspace-admin@, with hello@ and support@ as aliases)
# and publish the policy that stops anyone forging Effy's name.

variable "workspace_dkim_public_key" {
  description = <<-EOT
    The FULL TXT value of the operator mail service's DKIM record, exactly as its admin console
    issued it — "v=DKIM1; k=rsa; p=<base64>". OPERATOR-SUPPLIED: it cannot be derived, and the
    private half never leaves the provider (spec FR-025).

    ⚠ NOT A SECRET. A DKIM *public* key is published in public DNS by design; that is its entire
    purpose. Committed on purpose, like everything else in global.tfvars.

    ⚠ This value is longer than 255 characters, which is the maximum length of ONE DNS
    character-string. dns.tf splits it — see the comment there before touching either.
  EOT
  type        = string

  validation {
    condition     = can(regex("^v=DKIM1; k=rsa; p=[A-Za-z0-9+/=]+$", var.workspace_dkim_public_key))
    error_message = "workspace_dkim_public_key must be a full TXT value of the form 'v=DKIM1; k=rsa; p=<base64>'."
  }

  validation {
    # A 2048-bit RSA public key is ~392 base64 characters; 1024-bit is ~216. Anything materially
    # shorter is a truncated paste, which publishes cleanly and then fails every signature check.
    condition     = length(var.workspace_dkim_public_key) > 300
    error_message = "workspace_dkim_public_key looks truncated (<300 chars). A 2048-bit key's TXT value is ~410 characters."
  }
}

variable "dmarc_rua" {
  description = "Address that receives DMARC aggregate reports. Monitor mode collects NOTHING without it, so there is no evidence on which to base a later tightening to quarantine/reject (spec FR-017)."
  type        = string
  default     = "mailto:dmarc@effyshopping.com"
}

variable "dmarc_policy" {
  description = <<-EOT
    The apex's DMARC policy. Starts at `none` (monitor) ON PURPOSE.

    ⚠ Tighten only on evidence from the rua reports, and only AFTER the operator mail service is
    both authorised (SPF) and signing (DKIM) on this domain — otherwise the policy quarantines
    Effy's own support replies, silently (spec FR-021).
  EOT
  type        = string
  default     = "none"

  validation {
    condition     = contains(["none", "quarantine", "reject"], var.dmarc_policy)
    error_message = "dmarc_policy must be one of: none, quarantine, reject."
  }
}
