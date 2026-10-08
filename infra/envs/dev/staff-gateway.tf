# The STAFF gateway — back-office's own front door (075-staff-gateway).
#
# ⚠ WHY THERE ARE TWO GATEWAYS. An HTTP API holds at most 300 routes and 300 integrations. The route
# limit can be raised by a quota request; the INTEGRATION limit cannot, and this platform creates
# one integration per function. On 2026-10-08 the shared gateway held 300 of each and a deployment
# was refused (074) — it could only be completed by merging two routes into one. Back-office is 142
# of those 300, is where the platform grows most, and is called by exactly one client, so it moved.
#
# ⚠ ONE BACKEND STILL (constitution v3.2.0, Principle III). A gateway is a managed, pay-per-request
# entry point: it runs none of our code and costs nothing while idle. The services behind this one
# are the same `apis/edge-api/` services, attached here instead of there. A THIRD gateway needs a
# constitution amendment first.
#
# ⚠ EXACTLY ONE AUTHORIZER, deliberately. A customer, shop or driver token presented here has no
# authorizer that could accept it — the refusal does not depend on any route being configured
# correctly. `gateway-placement.contract.test.ts` fails if a second one is declared in this file.
#
# What attaches: admin, fleet, orders, catalog, inventory-staff. Which service goes where, and what
# to do when either gateway nears its ceiling: docs/api/path-assignment.md.

locals {
  staff_api_domain = "${var.staff_api_subdomain}.${module.dns.zone_name}" # staff-api.dev.effyshopping.com
  staff_api_url    = "https://${local.staff_api_domain}"
}

resource "aws_apigatewayv2_api" "staff" {
  name          = "${module.shared.name_prefix}-staff"
  protocol_type = "HTTP"
  description   = "Effy staff HTTP API - back-office services only (075)"

  # ⚠ disable_execute_api_endpoint stays false, as on the shared gateway (010 FR-011): the raw URL
  # is the break-glass fallback, published at /effy/<env>/staff/api_default_endpoint.

  # ⚠ ONLY the back-office origins — tighter than the shared gateway's list, which serves every
  # browser surface. A page on the storefront or the shop console has no reason to call a staff
  # route, so it is not given the CORS grant to try. Methods and headers match the shared gateway:
  # the same client library makes the calls.
  cors_configuration {
    allow_origins  = local.back_office_origins
    allow_methods  = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers  = ["Authorization", "Content-Type", "X-Request-ID"]
    expose_headers = ["x-request-id"]
    max_age        = 43200
  }
}

# $default auto-deploy stage → paths carry no stage segment, exactly as on the shared gateway, so a
# service's routes are identical on either.
resource "aws_apigatewayv2_stage" "staff_default" {
  api_id      = aws_apigatewayv2_api.staff.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_authorizer" "staff_back_office" {
  api_id           = aws_apigatewayv2_api.staff.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${module.shared.name_prefix}-staff-back-office"

  jwt_configuration {
    # The same pool and clients the shared gateway's back-office authorizer named — read from the
    # one map, so the two cannot disagree while both exist.
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${local.edge_pools["back-office"].pool_id}"
    audience = concat([local.edge_pools["back-office"].client_id], local.edge_pools["back-office"].extra_client_ids)
  }
}

# ── The platform-owned address ───────────────────────────────────────────────────────────────────
#
# Its own hostname, not a path on the shared one. Several APIs CAN be mapped to one domain by path,
# but the provider's documentation does not say whether the mapping key is removed before the API
# matches its routes — and every route here begins with its service's name. A design should not rest
# on that (075 research R2). One more label under the zone is covered by the wildcard certificate.
resource "aws_apigatewayv2_domain_name" "staff" {
  domain_name = local.staff_api_domain

  domain_name_configuration {
    certificate_arn = module.dns.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

# No mapping key → paths pass through untouched (/admin/v1/…, /fleet/v1/…).
resource "aws_apigatewayv2_api_mapping" "staff" {
  api_id      = aws_apigatewayv2_api.staff.id
  domain_name = aws_apigatewayv2_domain_name.staff.id
  stage       = aws_apigatewayv2_stage.staff_default.id
}

resource "aws_route53_record" "staff_api_a" {
  zone_id = module.dns.zone_id
  name    = local.staff_api_domain
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.staff.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.staff.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "staff_api_aaaa" {
  zone_id = module.dns.zone_id
  name    = local.staff_api_domain
  type    = "AAAA"

  alias {
    name                   = aws_apigatewayv2_domain_name.staff.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.staff.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# ── App↔infra contract: /effy/<env>/staff/… (docs/api/shared-gateway.md) ─────────────────────────
#
# The same four facts the shared gateway publishes under /edge/, under their own prefix. Each
# back-office stack reads the id and the authorizer at deploy time.
resource "aws_ssm_parameter" "staff_http_api_id" {
  name  = "/effy/${var.env}/staff/http_api_id"
  type  = "String"
  value = aws_apigatewayv2_api.staff.id
  tier  = "Standard"
}

resource "aws_ssm_parameter" "staff_api_endpoint" {
  name  = "/effy/${var.env}/staff/api_endpoint"
  type  = "String"
  value = local.staff_api_url
  tier  = "Standard"
}

resource "aws_ssm_parameter" "staff_api_default_endpoint" {
  name  = "/effy/${var.env}/staff/api_default_endpoint"
  type  = "String"
  value = aws_apigatewayv2_api.staff.api_endpoint
  tier  = "Standard"
}

resource "aws_ssm_parameter" "staff_authorizer_back_office_id" {
  name  = "/effy/${var.env}/staff/authorizer/back-office_id"
  type  = "String"
  value = aws_apigatewayv2_authorizer.staff_back_office.id
  tier  = "Standard"
}

# ── "A back-office route is failing" ─────────────────────────────────────────────────────────────
#
# The shared gateway's 5xx alarm (edge-gateway.tf) is keyed to that gateway's id. The moment a
# back-office stack is redeployed here, its server errors stop counting there. Without this alarm
# every back-office route would have gone unwatched on the day it moved, with nothing to say so.
# Same threshold, same topic, and no ok_actions for the same reason.
resource "aws_cloudwatch_metric_alarm" "staff_api_5xx" {
  alarm_name          = "${module.shared.name_prefix}-staff-api-5xx"
  alarm_description   = "Back-office requests through the staff API gateway are failing with server errors (more than 5 in 5 minutes), on any service. Open the gateway's 5xx metric by route, then that function's logs."
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  dimensions          = { ApiId = aws_apigatewayv2_api.staff.id }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

output "staff_http_api_id" {
  description = "Staff HTTP API id (also in SSM /effy/<env>/staff/http_api_id)."
  value       = aws_apigatewayv2_api.staff.id
}

output "staff_api_endpoint" {
  description = "The staff gateway's platform-owned address (also in SSM /effy/<env>/staff/api_endpoint)."
  value       = local.staff_api_url
}
