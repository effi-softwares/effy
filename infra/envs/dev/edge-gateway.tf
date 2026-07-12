# Shared edge API Gateway (004-backend-bootstrap, plan amendment A3 — cold-path decomposition).
#
# The cost-optimized path is many independently deployable Serverless services behind ONE HTTP
# API. Terraform owns the API + the four per-pool JWT authorizers (the same layer that owns the
# Cognito pools, VPC, RDS); each service attaches by id via provider.httpApi.id and references an
# authorizer by id (research Part F, option a). CORS + the API-level 5xx alarm live here because
# a service that attaches to an external API cannot configure them.

locals {
  # audience → the pool it authorizes. Hyphenated 'back-office' matches the SSM auth path form.
  edge_pools = {
    customer      = { pool_id = module.customer_pool.user_pool_id, client_id = module.customer_pool.app_client_id }
    driver        = { pool_id = module.driver_pool.user_pool_id, client_id = module.driver_pool.app_client_id }
    shop          = { pool_id = module.shop_pool.user_pool_id, client_id = module.shop_pool.app_client_id }
    "back-office" = { pool_id = module.back_office_pool.user_pool_id, client_id = module.back_office_pool.app_client_id }
  }
}

resource "aws_apigatewayv2_api" "edge" {
  name          = "${module.shared.name_prefix}-edge"
  protocol_type = "HTTP"
  description   = "Effy cold-path shared HTTP API — services attach by id under /<service>/ (A3)"

  # ⚠ disable_execute_api_endpoint MUST remain false (its default). Setting it true kills the raw
  # execute-api URL — silently violating 010's FR-011 (the cutover is ADDITIVE) and SC-004 (zero
  # callers broken). The custom domain in edge-domain.tf is added ALONGSIDE it, never instead of it.
  # The raw URL is published at /effy/<env>/edge/api_default_endpoint as the break-glass fallback.

  # Approved dev origins. :5173 back-office (005) · :5174 shop-web (007) · :3000 reserved for
  # customer-web. A service that attaches to an external HTTP API cannot configure CORS, so it
  # lives here — a new console's origin is a Terraform change, not a code change.
  cors_configuration {
    allow_origins  = ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"]
    allow_methods  = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers  = ["Authorization", "Content-Type", "X-Request-ID"]
    expose_headers = ["x-request-id"]
    max_age        = 43200
  }
}

# $default auto-deploy stage → requests hit <api_endpoint>/<service>/... with no stage segment.
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.edge.id
  name        = "$default"
  auto_deploy = true
}

# One JWT authorizer per pool (Principle IV — a cross-pool token is structurally rejected).
resource "aws_apigatewayv2_authorizer" "pool" {
  for_each = local.edge_pools

  api_id           = aws_apigatewayv2_api.edge.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${module.shared.name_prefix}-edge-${each.key}"

  jwt_configuration {
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${each.value.pool_id}"
    audience = [each.value.client_id]
  }
}

# App↔infra contract: /effy/<env>/edge/{http_api_id, api_endpoint, authorizer/<audience>_id}
# (shared-gateway.contract.md). Each service's serverless.yml reads these at deploy time.
resource "aws_ssm_parameter" "edge_http_api_id" {
  name  = "/effy/${var.env}/edge/http_api_id"
  type  = "String"
  value = aws_apigatewayv2_api.edge.id
  tier  = "Standard"
}

# THE address callers should use. The KEY is unchanged (a rename is a breaking change to the 001
# contract); only its VALUE improves — it now holds the platform-owned custom domain instead of the
# provider-generated hostname (010 research R4). Every existing reader (both web .env files, the
# Makefile verify targets, README.md) already means "where do I call this env's API", so all of them
# pick up the branded address with zero code edits — that is SC-003 satisfied by construction.
#
# The raw URL is NOT lost: it is published at .../edge/api_default_endpoint (edge-domain.tf).
resource "aws_ssm_parameter" "edge_api_endpoint" {
  name  = "/effy/${var.env}/edge/api_endpoint"
  type  = "String"
  value = local.api_url
  tier  = "Standard"
}

resource "aws_ssm_parameter" "edge_authorizer_id" {
  for_each = local.edge_pools

  name  = "/effy/${var.env}/edge/authorizer/${each.key}_id"
  type  = "String"
  value = aws_apigatewayv2_authorizer.pool[each.key].id
  tier  = "Standard"
}

# API-level 5xx alarm (moved from the service — A3; a service on an external API can't own it).
resource "aws_cloudwatch_metric_alarm" "edge_api_5xx" {
  alarm_name          = "${module.shared.name_prefix}-edge-api-5xx"
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  dimensions          = { ApiId = aws_apigatewayv2_api.edge.id }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
}

output "edge_http_api_id" {
  description = "Shared edge HTTP API id (also in SSM /effy/<env>/edge/http_api_id)."
  value       = aws_apigatewayv2_api.edge.id
}

output "edge_api_endpoint" {
  description = "Shared edge HTTP API invoke URL (also in SSM /effy/<env>/edge/api_endpoint)."
  value       = aws_apigatewayv2_api.edge.api_endpoint
}
