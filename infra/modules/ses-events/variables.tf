variable "name_prefix" {
  description = "Resource name prefix — module.shared.name_prefix (effy-<env>). A second environment is this module called with a different prefix, never a copied file (037 FR-040)."
  type        = string
}

variable "aws_account_id" {
  description = "Target AWS account id — pins the topic policy's aws:SourceAccount condition so only this account's SES may publish."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be exactly 12 digits."
  }
}

variable "suppressed_reasons" {
  description = <<-EOT
    Which outcomes cause an address to be added to — and blocked by — the ACCOUNT-LEVEL suppression
    list, for mail sent through this configuration set.

    ["BOUNCE", "COMPLAINT"] (the default) = inherit the account's own behaviour. Correct for
    PRODUCTION: a genuinely dead address stops being retried, which protects sending reputation.

    [] = cancel all suppression for this configuration set. Correct for NON-PRODUCTION, and the
    reason is not convenience: the account-level list is account-wide AND region-wide, so a
    mistyped address in dev would otherwise make that person unreachable in production (FR-041).

    ⚠ THE COST OF [] IS REAL. With suppression cancelled, this environment keeps sending to
    genuinely dead addresses and each attempt counts toward the shared account bounce rate. That is
    acceptable at single-digit daily volume and would not be at scale. It is survivable here only
    because this slice RECORDS every such failure, so a dead address is visible rather than absorbed.

    ⚠ AN EMPTY BLOCK IS NOT AN EMPTY LIST. See the trap notes in main.tf before changing this.
  EOT
  type        = list(string)
  default     = ["BOUNCE", "COMPLAINT"]

  validation {
    condition     = alltrue([for r in var.suppressed_reasons : contains(["BOUNCE", "COMPLAINT"], r)])
    error_message = "suppressed_reasons may contain only BOUNCE and COMPLAINT."
  }
}

variable "tags" {
  description = "Extra tags. The provider's default_tags already cover the base set."
  type        = map(string)
  default     = {}
}
