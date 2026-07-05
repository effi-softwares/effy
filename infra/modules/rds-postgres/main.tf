# One PostgreSQL instance + its directly-attached plumbing (SG, subnet group, parameter
# group) at the COST FLOOR: every separately-billed RDS option is off by default and only
# loosened through explicit lever variables (specs/002-dev-database — research.md D2/D3).
# The master password is RDS-managed in Secrets Manager and never enters Terraform.

locals {
  db_identifier = "${var.name_prefix}-db"

  # Engine major drives the parameter-group family ("16" or "16.x" → postgres16).
  engine_major = split(".", var.engine_version)[0]

  # Network override seam (research.md D8): null → the account default VPC; the future
  # network slice passes explicit ids to re-home the instance without touching this module.
  discover_network = var.vpc_id == null
  vpc_id           = local.discover_network ? data.aws_vpc.default[0].id : var.vpc_id
  subnet_ids       = var.subnet_ids == null ? data.aws_subnets.default[0].ids : var.subnet_ids
}

data "aws_vpc" "default" {
  count   = local.discover_network ? 1 : 0
  default = true
}

data "aws_subnets" "default" {
  count = var.subnet_ids == null ? 1 : 0

  filter {
    name   = "vpc-id"
    values = [local.vpc_id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# Deny-by-default boundary: with allowed_cidrs = [] no ingress rule exists at all.
# Egress is deliberately unmanaged — the instance initiates nothing.
resource "aws_security_group" "db" {
  name        = local.db_identifier
  description = "PostgreSQL ingress to ${local.db_identifier} - allowlisted CIDRs only (spec FR-006)"
  vpc_id      = local.vpc_id

  tags = merge(var.tags, { Name = local.db_identifier })
}

resource "aws_vpc_security_group_ingress_rule" "postgres" {
  for_each = toset(var.allowed_cidrs)

  security_group_id = aws_security_group.db.id
  description       = "PostgreSQL from allowlisted CIDR"
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 5432
  to_port           = 5432
}

# RDS requires a subnet group spanning >= 2 AZs even for single-AZ instances.
resource "aws_db_subnet_group" "db" {
  name        = local.db_identifier
  description = "Subnets for ${local.db_identifier}"
  subnet_ids  = local.subnet_ids

  tags = var.tags
}

# Dedicated parameter group: deterministic forced TLS (research.md D7) and the future
# home for per-env engine tuning.
resource "aws_db_parameter_group" "db" {
  name_prefix = "${local.db_identifier}-"
  family      = "postgres${local.engine_major}"
  description = "Engine parameters for ${local.db_identifier} (rds.force_ssl)"

  parameter {
    name  = "rds.force_ssl"
    value = var.apply_force_ssl ? "1" : "0"
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

# The cost-floor posture below (no backups, single-AZ, public-with-allowlist in dev) is a
# DOCUMENTED, accepted dev-only decision with reversal levers — see
# specs/002-dev-database/contracts/cost-posture.contract.md and research.md D3/D4.
# Targeted scanner suppressions carry that rationale; they are not oversights.
#trivy:ignore:avd-aws-0077 backups deliberately OFF in dev: disposable data, no RPO (spec edge case + FR-005); promotion lever db_backup_retention_days
#trivy:ignore:avd-aws-0082 dev-only allowlisted-public posture (research.md D4): SG allowlist + forced TLS + managed secret; qa+ stays private
#trivy:ignore:avd-aws-0180 dev-only allowlisted-public posture (research.md D4)
#trivy:ignore:avd-aws-0133 Performance Insights is a paid lever, deliberately OFF at the dev cost floor (FR-005)
#trivy:ignore:avd-aws-0176 IAM database auth deferred to the first consumer slice; master credential is Secrets-Manager-managed
resource "aws_db_instance" "db" {
  identifier = local.db_identifier

  engine                     = "postgres"
  engine_version             = var.engine_version
  auto_minor_version_upgrade = true
  instance_class             = var.instance_class

  allocated_storage = var.allocated_storage_gb
  storage_type      = var.storage_type
  storage_encrypted = true
  # NO max_allocated_storage: storage autoscaling off — cost is a fixed number (D2).

  db_name  = var.db_name
  username = var.master_username
  # The one and only credential path: RDS-managed master password in Secrets Manager.
  manage_master_user_password = true

  multi_az               = var.multi_az
  publicly_accessible    = var.publicly_accessible
  db_subnet_group_name   = aws_db_subnet_group.db.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name   = aws_db_parameter_group.db.name

  # Cost posture (contracts/cost-posture.contract.md) — each line maps to a contract row.
  backup_retention_period      = var.backup_retention_days
  skip_final_snapshot          = true
  deletion_protection          = var.deletion_protection
  performance_insights_enabled = var.performance_insights_enabled
  database_insights_mode       = "standard"
  monitoring_interval          = var.monitoring_interval
  # NO enabled_cloudwatch_logs_exports, NO RDS Proxy, NO snapshot exports.

  apply_immediately = var.apply_immediately

  tags = var.tags
}
