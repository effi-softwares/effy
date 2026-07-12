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
