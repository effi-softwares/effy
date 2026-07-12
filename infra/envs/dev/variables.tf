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

# --- Domain & DNS (010-domain-dns-foundation) ---

variable "root_domain" {
  description = "The platform's registered domain. This env's namespace is <env>.<root_domain>; the parent zone is owned by infra/global/ and looked up by name."
  type        = string
  default     = "effyshopping.com"
}

variable "api_subdomain" {
  description = "Single label for the shared COLD-PATH API under this env's namespace → edge-api.dev.effyshopping.com. Named for the path it fronts, not generically: the hot path (core-api) gets its own name when it deploys, and a bare `api` would have quietly claimed the shared word for one of two backends. MUST stay one label — the wildcard certificate matches exactly one (010 research R3)."
  type        = string
  default     = "edge-api"
}

variable "ses_sender_enabled" {
  description = "Flip to true ONLY after the SES domain identity reports VERIFIED (`make mail-verify ENV=dev`). Cognito REJECTS a source_arn whose identity is unverified, and verification is asynchronous — it completes minutes after the apply that creates the DKIM records returns. false = the four pools stay on the Cognito built-in sender; true = they send as no-reply@<env>.<root_domain>. This flag is the gate made explicit (010 tasks T028a)."
  type        = bool
  default     = false
}
