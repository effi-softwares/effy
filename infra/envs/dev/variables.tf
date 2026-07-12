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

# --- Database (002-dev-database) — defaults are the cost floor; each is a grow-later lever ---

variable "db_instance_class" {
  description = "RDS instance size lever."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Storage GB (grow-only in RDS)."
  type        = number
  default     = 20
}

variable "db_storage_type" {
  description = "gp3 preferred (research.md 002 D2)."
  type        = string
  default     = "gp3"
}

variable "db_allowed_cidrs" {
  description = "Operator /32 allowlist for port 5432. [] = nobody can connect."
  type        = list(string)
  default     = []
}

variable "db_multi_az" {
  description = "Durability lever (~2x instance cost)."
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  description = "0 = automated backups OFF (dev accepted risk); promotion sets 7+."
  type        = number
  default     = 0
}

variable "db_deletion_protection" {
  description = "Flip true before an env holds real data."
  type        = bool
  default     = false
}

variable "db_performance_insights" {
  description = "Paid observability lever; false = free floor."
  type        = bool
  default     = false
}

variable "db_publicly_accessible" {
  description = "true is the documented DEV-ONLY allowlisted-public posture (002 research.md D4); qa+ must stay false."
  type        = bool
  default     = false
}

variable "db_allow_public_ingress" {
  description = "DEV-ONLY (002 FR-006, amended 2026-07-12). false = 0.0.0.0/0 in db_allowed_cidrs is REJECTED, so a public database cannot be created by accident. dev sets true because the edge-api Lambdas run outside the VPC and egress from unpinnable AWS IPs. NEVER true where real data lives."
  type        = bool
  default     = false
}
