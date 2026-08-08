# Inputs for a single public container behind an Application Load Balancer, at the cheapest
# posture (one fixed task, no autoscaling). Every environment-specific value is here — the prod
# root instantiates the same module with different values (spec FR-014 / SC-003).

variable "env" {
  description = "Environment name (dev/qa/staging/prod). Tags + resource naming."
  type        = string
}

variable "name_prefix" {
  description = "Resource name prefix, e.g. effy-dev (from the _shared module)."
  type        = string
}

variable "aws_region" {
  description = "Region — config, never a literal. Used for the awslogs driver."
  type        = string
}

# ── Networking ────────────────────────────────────────────────────────────────────────────────
variable "subnet_ids" {
  description = "Subnets for the ALB and the task. Empty → the module resolves the DEFAULT VPC's public subnets (the cheapest dev posture, no NAT). Prod supplies PRIVATE subnet ids here."
  type        = list(string)
  default     = []
}

variable "assign_public_ip" {
  description = "Give the task a public IP so it egresses via the internet gateway with NO NAT (dev). Prod sets false (private subnets + NAT/endpoints)."
  type        = bool
  default     = true
}

# ── Compute (cheapest) ──────────────────────────────────────────────────────────────────────
variable "cpu" {
  description = "Fargate task CPU units. 256 = 0.25 vCPU, the smallest that exists."
  type        = number
  default     = 256
}

variable "memory" {
  description = "Fargate task memory (MiB). 512 is the smallest valid pairing with 256 CPU."
  type        = number
  default     = 512
}

variable "container_port" {
  description = "Port the container listens on."
  type        = number
  default     = 8080
}

variable "desired_count" {
  description = "Number of running tasks. FIXED at 1 for the cheapest posture; there is NO autoscaling."
  type        = number
  default     = 1
}

# ── Image ───────────────────────────────────────────────────────────────────────────────────
variable "image_tag" {
  description = "Image tag to run from the module's ECR repo. dev: latest (mutable); prod: an immutable git-sha."
  type        = string
  default     = "latest"
}

# ── Front door ──────────────────────────────────────────────────────────────────────────────
variable "certificate_arn" {
  description = "ACM certificate ARN for the HTTPS listener (the env's regional wildcard). Reused, never minted here."
  type        = string
}

variable "zone_id" {
  description = "Route 53 hosted zone id for the A/AAAA alias records."
  type        = string
}

variable "hostname" {
  description = "Fully-qualified hostname the ALB answers on, e.g. core-api.dev.effyshopping.com."
  type        = string
}

variable "health_check_path" {
  description = "ALB target-group health check path. Liveness /healthz, NOT /readyz (research R9)."
  type        = string
  default     = "/healthz"
}

variable "idle_timeout" {
  description = "ALB idle timeout (seconds). 120 comfortably covers checkout round-trips (FR-010)."
  type        = number
  default     = 120
}

# ── Rollout (cheapest single-task, with auto-rollback) ──────────────────────────────────────
variable "min_healthy_percent" {
  description = "Deployment minimum healthy percent. 0 = ECS may stop the old task before starting the new one (never two tasks; a brief accepted deploy gap)."
  type        = number
  default     = 0
}

variable "max_percent" {
  description = "Deployment maximum percent. 100 = never run more than the desired count (no transient second task)."
  type        = number
  default     = 100
}

# ── Runtime configuration ───────────────────────────────────────────────────────────────────
variable "environment" {
  description = "Non-secret container env (name → value). Plain task-def env is fine for these."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Secret container env (name → ECS valueFrom). Resolved at task start by the execution role; never in the task-def plaintext or state. DB password uses the JSON-key selector (…:password::)."
  type        = map(string)
  default     = {}
}

variable "secret_arns" {
  description = "Base ARNs the EXECUTION role may GetSecretValue on (the DB master secret + Stripe secrets). Distinct from `secrets`, whose values carry JSON-key selectors IAM does not accept."
  type        = list(string)
  default     = []
}

variable "task_role_s3_bucket_arn" {
  description = "Bucket ARN the TASK role may s3:GetObject on (product media, for presign). Empty → no S3 grant."
  type        = string
  default     = ""
}

# ── Logs ────────────────────────────────────────────────────────────────────────────────────
variable "log_retention" {
  description = "CloudWatch Logs retention (days). Short = cheap."
  type        = number
  default     = 7
}
