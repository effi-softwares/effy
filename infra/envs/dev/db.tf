# The dev operational database (002-dev-database) at the COST FLOOR: db.t4g.micro,
# 20 GB gp3, single-AZ, every separately-billed option OFF — ≈ US$22/mo. Every choice
# here is a reversible tfvars lever (quickstart runbook). Backups are OFF: dev data is
# disposable by decision; flip db_backup_retention_days before any real data appears.

module "db" {
  source = "../../modules/rds-postgres"

  name_prefix = module.shared.name_prefix

  instance_class       = var.db_instance_class
  allocated_storage_gb = var.db_allocated_storage
  storage_type         = var.db_storage_type

  # Dev-only posture (002 research.md D4): public endpoint + operator allowlist + forced
  # TLS is the $0 network design. [] allowlist = nobody. qa+ must use private placement.
  publicly_accessible = var.db_publicly_accessible
  allowed_cidrs       = var.db_allowed_cidrs
  # FR-006 escape hatch — false everywhere except dev. See variables.tf / dev.tfvars.
  allow_public_ingress = var.db_allow_public_ingress

  multi_az                     = var.db_multi_az
  backup_retention_days        = var.db_backup_retention_days
  deletion_protection          = var.db_deletion_protection
  performance_insights_enabled = var.db_performance_insights
}

# App↔infra contract additions (002 contracts/ssm-parameters.contract.md):
# /effy/<env>/db/* — config only; the secret stays in Secrets Manager, SSM carries its ARN.
resource "aws_ssm_parameter" "db" {
  for_each = {
    endpoint          = module.db.endpoint
    port              = tostring(module.db.port)
    name              = module.db.db_name
    master_username   = module.db.master_username
    master_secret_arn = module.db.master_secret_arn
  }

  name  = "/effy/${var.env}/db/${each.key}"
  type  = "String"
  value = each.value
  tier  = "Standard"
}

output "db_endpoint" {
  description = "Database hostname."
  value       = module.db.endpoint
}

output "db_port" {
  description = "Database port."
  value       = module.db.port
}

output "db_name" {
  description = "Initial database name."
  value       = module.db.db_name
}

output "db_master_secret_arn" {
  description = "Secrets Manager ARN of the RDS-managed master secret (pointer, not the secret)."
  value       = module.db.master_secret_arn
}

output "db_security_group_id" {
  description = "The DB security group — future consumer slices attach SG-to-SG rules here."
  value       = module.db.security_group_id
}
