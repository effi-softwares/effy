# Network plumbing for edge-api's Lambdas (004-backend-bootstrap, plan amendment A1).
#
# Discovered at first deploy: out-of-VPC Lambdas egress from arbitrary AWS IPs, which
# the dev DB's operator-IP allowlist (002 cost-floor posture) rightly refuses. Fix:
# place the functions in the default VPC (where the DB already lives), admit them
# SG-to-SG (the rds-postgres module's security_group_id output exists precisely for
# this), and give the ONLY runtime AWS API call (Secrets Manager, via the
# Parameters/Secrets extension) a private path with an interface endpoint — an in-VPC
# Lambda has no internet without NAT.
#
# Cost posture: ONE endpoint ENI in ONE AZ ≈ US$9/mo (vs NAT ≈ $32/mo). Dev tolerates
# a single-AZ endpoint; qa+ revisit AZ coverage with their own network slice.
# CloudWatch Logs need no endpoint (Lambda logging bypasses the customer VPC path);
# SSM values resolve at DEPLOY time from the operator's machine, not at runtime.
#
# Cognito, however, IS a runtime call as of 009 (shop-management provisions shop-pool users
# via AdminCreateUser). 004's original note — "Cognito resolves at deploy time" — stopped being
# true the moment a handler called the Cognito API itself. Without a private path such a call
# has nowhere to go: an in-VPC Lambda with no NAT opens a TCP connection to the public Cognito
# endpoint that never completes, so the function does not error — it HANGS to its 10s timeout
# and the caller sees a bare 500. Hence the second interface endpoint below.

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

locals {
  edge_subnet_ids = sort(data.aws_subnets.default.ids)
  # The endpoint lives in one AZ (cost floor); the Lambdas span all default subnets
  # and cross AZ to reach it — acceptable in dev.
  edge_endpoint_subnet_ids = [local.edge_subnet_ids[0]]
}

# The edge-api Lambdas' security group — the identity other groups reference.
resource "aws_security_group" "edge_lambda" {
  name        = "${module.shared.name_prefix}-edge-lambda"
  description = "effy edge-api Lambda functions (004-backend-bootstrap)"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_egress_rule" "edge_lambda_all" {
  security_group_id = aws_security_group.edge_lambda.id
  description       = "Egress to the DB + the Secrets Manager endpoint (no NAT = no real internet path)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# SG-to-SG: the DB admits edge-api Lambdas, alongside the operator-IP CIDR rules.
resource "aws_vpc_security_group_ingress_rule" "db_from_edge_lambda" {
  security_group_id            = module.db.security_group_id
  description                  = "edge-api Lambdas (004-backend-bootstrap)"
  referenced_security_group_id = aws_security_group.edge_lambda.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

# Shared SG for the edge-api interface endpoints (Secrets Manager + Cognito).
# NOTE: `description` is immutable in AWS — editing it forces a replacement of this SG and every
# rule referencing it. Left at its original wording on purpose; it is not worth the churn.
resource "aws_security_group" "edge_vpce" {
  name        = "${module.shared.name_prefix}-edge-vpce"
  description = "Secrets Manager interface endpoint for edge-api"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "vpce_https_from_edge_lambda" {
  security_group_id            = aws_security_group.edge_vpce.id
  description                  = "HTTPS from edge-api Lambdas"
  referenced_security_group_id = aws_security_group.edge_lambda.id
  from_port                    = 443
  to_port                      = 443
  ip_protocol                  = "tcp"
}

resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.edge_endpoint_subnet_ids
  security_group_ids  = [aws_security_group.edge_vpce.id]
  private_dns_enabled = true

  tags = {
    Name = "${module.shared.name_prefix}-secretsmanager"
  }
}

# Cognito interface endpoint — the private path for the 009 shop-user provisioning calls
# (AdminCreateUser / AdminAddUserToGroup / AdminDisableUser …). Same single-AZ cost posture as
# above: a second ENI ≈ US$9/mo, still well under a NAT gateway.
resource "aws_vpc_endpoint" "cognito_idp" {
  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.${var.aws_region}.cognito-idp"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.edge_endpoint_subnet_ids
  security_group_ids  = [aws_security_group.edge_vpce.id]
  private_dns_enabled = true

  tags = {
    Name = "${module.shared.name_prefix}-cognito-idp"
  }
}

# App↔infra contract additions: /effy/<env>/edge/* (recorded in
# specs/004-backend-bootstrap/contracts/config.contract.md). serverless.yml reads both
# at deploy time; renaming a key is a breaking change to that contract.
resource "aws_ssm_parameter" "edge_security_group_id" {
  name  = "/effy/${var.env}/edge/security_group_id"
  type  = "String"
  value = aws_security_group.edge_lambda.id
  tier  = "Standard"
}

resource "aws_ssm_parameter" "edge_subnet_ids" {
  name  = "/effy/${var.env}/edge/subnet_ids"
  type  = "StringList"
  value = join(",", local.edge_subnet_ids)
  tier  = "Standard"
}

output "edge_lambda_security_group_id" {
  description = "SG the edge-api Lambdas run under (also in SSM /effy/<env>/edge/security_group_id)."
  value       = aws_security_group.edge_lambda.id
}

output "edge_secretsmanager_endpoint_id" {
  description = "The Secrets Manager interface endpoint (the ~US$9/mo dev lever)."
  value       = aws_vpc_endpoint.secretsmanager.id
}

output "edge_cognito_idp_endpoint_id" {
  description = "The Cognito interface endpoint — required for 009 runtime shop-user provisioning."
  value       = aws_vpc_endpoint.cognito_idp.id
}
