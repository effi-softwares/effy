variable "name_prefix" {
  description = "effy-<env> — the instance is named <name_prefix>-db."
  type        = string
}

variable "engine_version" {
  description = "PostgreSQL version, MAJOR-pinned (e.g. \"16\") so free auto minor upgrades keep the instance inside standard support — RDS Extended Support surcharges stay structurally unbillable (research.md D1)."
  type        = string
  default     = "16"
}

variable "instance_class" {
  description = "Size lever. db.t4g.micro is the cost floor (operator directive #1)."
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage_gb" {
  description = "Storage lever — grow-only in RDS, so start at the floor."
  type        = number
  default     = 20

  validation {
    condition     = var.allocated_storage_gb >= 20
    error_message = "allocated_storage_gb must be >= 20 (RDS minimum for gp3)."
  }
}

variable "storage_type" {
  description = "gp3 preferred: same-or-cheaper than gp2 with 3000 baseline IOPS at any size (research.md D2)."
  type        = string
  default     = "gp3"

  validation {
    condition     = contains(["gp3", "gp2"], var.storage_type)
    error_message = "storage_type must be gp3 or gp2 (io1/io2 are premium options outside this module's cost posture)."
  }
}

variable "db_name" {
  description = "Initial database created at provision time."
  type        = string
  default     = "effy"
}

variable "master_username" {
  description = "Master username. The password is ALWAYS RDS-managed in Secrets Manager — this module has no password input and never will (research.md D5)."
  type        = string
  default     = "effy_admin"
}

variable "multi_az" {
  description = "Durability lever (~2x instance cost when true)."
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "0 = automated backups OFF (the dev cost floor; an accepted, documented risk). Promotion lever: set 7+."
  type        = number
  default     = 0

  validation {
    condition     = var.backup_retention_days >= 0 && var.backup_retention_days <= 35
    error_message = "backup_retention_days must be between 0 and 35."
  }
}

variable "deletion_protection" {
  description = "Promotion lever — flip true before an env holds real data."
  type        = bool
  default     = false
}

variable "performance_insights_enabled" {
  description = "Paid observability lever. false = the free floor (basic CloudWatch metrics only)."
  type        = bool
  default     = false
}

variable "monitoring_interval" {
  description = "Enhanced Monitoring interval in seconds; 0 = OFF (no per-metric CloudWatch ingest cost)."
  type        = number
  default     = 0

  validation {
    condition     = contains([0, 1, 5, 10, 15, 30, 60], var.monitoring_interval)
    error_message = "monitoring_interval must be one of 0, 1, 5, 10, 15, 30, 60."
  }
}

variable "publicly_accessible" {
  description = "Cautious default is private. The dev root passes true explicitly — the documented dev-only allowlisted-public posture (research.md D4); qa+ must stay false."
  type        = bool
  default     = false
}

variable "allowed_cidrs" {
  description = "SG ingress on 5432. [] (default) = NOBODY can connect — adding a CIDR is a deliberate act. Internet-open ingress requires allow_public_ingress = true (002 spec FR-006, amended 2026-07-12)."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for c in var.allowed_cidrs : can(cidrhost(c, 0))])
    error_message = "Every entry in allowed_cidrs must be a valid CIDR (e.g. 203.0.113.7/32)."
  }

  # FR-006 still holds BY DEFAULT: an internet-open database remains unexpressable unless the
  # operator has consciously flipped allow_public_ingress. The rule did not get weaker — the
  # exception just got a name, so it is greppable and reviewable instead of being a hole here.
  validation {
    condition     = var.allow_public_ingress || alltrue([for c in var.allowed_cidrs : !contains(["0.0.0.0/0", "::/0"], c)])
    error_message = "allowed_cidrs contains 0.0.0.0/0 or ::/0 but allow_public_ingress is false — the database is not open to the internet at large (spec FR-006). If you truly intend a public database, set allow_public_ingress = true in the env's tfvars and read the warning there."
  }
}

variable "allow_public_ingress" {
  description = <<-EOT
    DEV-ONLY ESCAPE HATCH (002 spec FR-006, amended 2026-07-12). Default false: 0.0.0.0/0 in
    allowed_cidrs is rejected, so a public database cannot be created by accident.

    Set true ONLY where a publicly reachable Postgres is a consciously accepted risk. It exists
    because the edge-api Lambdas run outside the VPC (they need internet egress to reach Cognito
    and Secrets Manager without paying for NAT or per-API interface endpoints) and therefore
    egress from arbitrary AWS IPs that no allowlist can pin.

    When true the database is exposed to the internet on 5432, defended only by forced TLS and
    the RDS-managed master password. NEVER set this in an environment holding real data.
  EOT
  type        = bool
  default     = false
}

variable "vpc_id" {
  description = "Override seam for the future network slice. null = discover the account default VPC. Pass together with subnet_ids."
  type        = string
  default     = null
}

variable "subnet_ids" {
  description = "Override seam (>= 2 AZs required by RDS). null = the default VPC's default subnets. Pass together with vpc_id."
  type        = list(string)
  default     = null
}

variable "apply_force_ssl" {
  description = "rds.force_ssl on the parameter group — non-TLS connections refused by the engine (research.md D7)."
  type        = bool
  default     = true
}

variable "apply_immediately" {
  description = "Apply modifications now instead of the next maintenance window. Dev-friendly default; promotion may set false."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Extra tags merged with the provider default_tags."
  type        = map(string)
  default     = {}
}
