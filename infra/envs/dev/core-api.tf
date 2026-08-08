# Hot-path (core-api) cloud deployment — 040-core-api-deploy.
#
# The Go backend (apis/core-api), until now local-Docker-only, runs in the cloud as ONE Fargate
# task behind an internet-facing ALB at core-api.dev.effyshopping.com — the cheapest posture, with
# robustness knowingly traded for price (operator directive). The reusable module owns the shape;
# this wrapper wires it to THIS root's existing resources (DNS, DB, media, cognito, Stripe secrets).
#
# ── PROD PROMOTION (config, not code — spec FR-014 / SC-003; detail in data-model.md § Prod delta) ──
#   core_api_assign_public_ip = false      # private subnets, NOT public
#   core_api_subnet_ids       = [<private>] # a NAT gateway / interface endpoints for egress
#   core_api_image_tag        = "<git-sha>" # immutable, a known rollback artifact
#   hostname → core-api.effyshopping.com   # ⚠ APEX-level: needs an apex record + a cert covering it
#                                          #   (owned by the prod/global root, not the child wildcard)
#   DB → private (db_publicly_accessible = false)  # the public-IP/no-NAT dev trade is invalid in prod
#
# ── COST-SHAPE (audited in the plan, SC-004) ──
#   This slice creates: 1 ECS service (fixed count) · 1 ALB · 1 ECR repo · 1 log group · 2 SGs · 2 IAM
#   roles · A/AAAA records · 1 SSM param. It creates NO aws_appautoscaling_* · NO aws_nat_gateway /
#   aws_eip(nat) / aws_vpc_endpoint · NO new aws_acm_certificate / aws_secretsmanager_secret /
#   aws_db_instance. Recurring dev cost ≈ $30/mo (research R12).

# Stripe secrets are operator-created (019), NOT Terraform-managed — look them up by name for their
# ARNs. They must exist before apply (quickstart precheck); a missing one fails loudly here.
data "aws_secretsmanager_secret" "stripe_secret_key" {
  name = "/effy/${var.env}/stripe/secret_key"
}

data "aws_secretsmanager_secret" "stripe_webhook_secret" {
  name = "/effy/${var.env}/stripe/webhook_secret"
}

module "core_api" {
  source = "../../modules/ecs-fargate-web-service"

  env         = var.env
  name_prefix = module.shared.name_prefix
  aws_region  = var.aws_region

  # Front door — reuse the env's wildcard cert + zone (no new certificate).
  certificate_arn = module.dns.certificate_arn
  zone_id         = module.dns.zone_id
  hostname        = "${var.core_api_subdomain}.${module.dns.zone_name}" # core-api.dev.effyshopping.com

  # Cheapest compute, single fixed task, no autoscaling.
  cpu           = var.core_api_cpu
  memory        = var.core_api_memory
  desired_count = var.core_api_desired_count
  image_tag     = var.core_api_image_tag

  # Cheapest network: default-VPC public subnets, public IP, no NAT (dev only).
  subnet_ids       = var.core_api_subnet_ids
  assign_public_ip = var.core_api_assign_public_ip

  # ── Non-secret runtime config (plain task-def env) ──
  environment = {
    EFFY_ENV             = var.env
    PORT                 = "8080"
    AWS_REGION           = var.aws_region
    LOG_LEVEL            = "info"
    CORS_ALLOWED_ORIGINS = join(",", var.core_api_cors_origins)
    AWS_MEDIA_BUCKET     = aws_s3_bucket.product_media.bucket

    # Customer pool + BOTH app clients (web,mobile) — a token from either is valid (027).
    AUTH_CUSTOMER_POOL_ID   = module.customer_pool.user_pool_id
    AUTH_CUSTOMER_CLIENT_ID = "${module.customer_pool.app_client_id},${aws_cognito_user_pool_client.customer_mobile.id}"

    # DB connection PARTS — the app composes the DSN from these + the injected password (040).
    DB_HOST = module.db.endpoint
    DB_PORT = tostring(module.db.port)
    DB_NAME = module.db.db_name
    DB_USER = module.db.master_username
  }

  # ── Secret runtime config (injected at task start; never in task-def plaintext or state) ──
  secrets = {
    # JSON-key extraction from the EXISTING RDS master secret — no duplicate password stored.
    DB_PASSWORD           = "${module.db.master_secret_arn}:password::"
    STRIPE_SECRET_KEY     = data.aws_secretsmanager_secret.stripe_secret_key.arn
    STRIPE_WEBHOOK_SECRET = data.aws_secretsmanager_secret.stripe_webhook_secret.arn
  }

  # Base ARNs the execution role may GetSecretValue on (no JSON-key selectors here).
  secret_arns = [
    module.db.master_secret_arn,
    data.aws_secretsmanager_secret.stripe_secret_key.arn,
    data.aws_secretsmanager_secret.stripe_webhook_secret.arn,
  ]

  # Task role: presign product media.
  task_role_s3_bucket_arn = aws_s3_bucket.product_media.arn
}

# App↔infra contract: /effy/<env>/core-api/base_url — clients read the hot-path base URL from here
# (the alias survives ALB recreation; the key survives a region move). Mirrors the edge api_endpoint.
resource "aws_ssm_parameter" "core_api_base_url" {
  name        = "/effy/${var.env}/core-api/base_url"
  description = "The hot-path (core-api) base URL for this env. customer-web + customer-mobile read this instead of hard-coding the hostname."
  type        = "String"
  value       = module.core_api.hostname_url
  tier        = "Standard"
}

output "core_api_base_url" {
  description = "The hot-path branded HTTPS base URL (also in SSM /effy/<env>/core-api/base_url)."
  value       = module.core_api.hostname_url
}

output "core_api_ecr_repository_url" {
  description = "Where to push core-api images (make core-image-push)."
  value       = module.core_api.ecr_repository_url
}
