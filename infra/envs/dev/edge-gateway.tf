# The shared edge API Gateway: customers, shops, drivers and the public; back-office has its own
# (staff-gateway.tf), because an HTTP API holds at most 300 integrations (a limit the provider does not
# raise) and this one filled. Terraform owns the API and the per-pool JWT authorizers; each Serverless
# service attaches by id (provider.httpApi.id) and references an authorizer by id. CORS and the API-level
# 5xx alarm live here because an attached service cannot configure them.

locals {
  # audience → the pool it authorizes. Hyphenated 'back-office' matches the SSM auth path form.
  #
  # `extra_client_ids` lets a pool authorize more than one app client - the customer and shop pools
  # each have two (web + a mobile client, 013/014). Every entry carries the key (empty where unused) so
  # the map stays a single object type; a heterogeneous map would fail the plan.
  edge_pools = {
    customer = {
      pool_id          = module.customer_pool.user_pool_id
      client_id        = module.customer_pool.app_client_id
      extra_client_ids = [aws_cognito_user_pool_client.customer_mobile.id]
    }
    shop = {
      pool_id          = module.shop_pool.user_pool_id
      client_id        = module.shop_pool.app_client_id
      extra_client_ids = []
    }
    driver        = { pool_id = module.driver_pool.user_pool_id, client_id = module.driver_pool.app_client_id, extra_client_ids = [aws_cognito_user_pool_client.driver_mobile.id] }
    "back-office" = { pool_id = module.back_office_pool.user_pool_id, client_id = module.back_office_pool.app_client_id, extra_client_ids = [] }
  }

  # The one list of browser origins, for this gateway's CORS and the product-media bucket's (media.tf): a
  # console mints a presigned URL here and PUTs to S3 directly, so the two must agree (declared twice, they
  # once diverged and only uploads failed, at a pre-flight).
  #
  # Localhost dev::5173 back-office ·:5174 shop-web ·:3000 customer-web.
  # Deployed consoles: derived from the zone, never a literal.
  browser_origins = concat(
    ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    [
      "https://${var.shop_web_subdomain}.${module.dns.zone_name}",
      "https://${var.back_office_subdomain}.${module.dns.zone_name}",
    ],
  )

  # The storefront's origins: gateway only, not in browser_origins (that list is also the media bucket's, and
  # the storefront never uploads). Its client-side catalogue fetches (search, facets, recently viewed) come
  # here. Derived from this environment's zone (the apex and www, amplify-customer-web.tf); no production
  # origin is listed in dev.
  storefront_origins = [
    "https://${module.dns.zone_name}",
    "https://www.${module.dns.zone_name}",
  ]

  # Back-office has its own gateway (staff-gateway.tf): this one carries no back-office authorizer and
  # allows no back-office origin, so a staff token is refused here on every route. `edge_pools` still lists
  # all four pools (the staff gateway reads the back-office entry); this gateway takes the other three. The
  # map is filtered, not re-keyed: re-keying would destroy and recreate the authorizers under live routes.
  shared_pools = { for k, v in local.edge_pools : k => v if k != "back-office" }

  # not `browser_origins` minus something written inline at the use site: that list is also the
  # product-media bucket's (media.tf), and back-office still uploads banner artwork straight to the
  # bucket. The bucket keeps the back-office origins; only this gateway drops them.
  back_office_origins = [
    "http://localhost:5173",
    "https://${var.back_office_subdomain}.${module.dns.zone_name}",
  ]
  shared_gateway_origins = concat(
    [for o in local.browser_origins : o if !contains(local.back_office_origins, o)],
    local.storefront_origins,
  )
}

resource "aws_apigatewayv2_api" "edge" {
  name          = "${module.shared.name_prefix}-edge"
  protocol_type = "HTTP"
  description   = "Effy cold-path shared HTTP API - services attach by id under /<service>/ (A3)"

  # disable_execute_api_endpoint must remain false (its default). Setting it true kills the raw
  # execute-api URL - silently violating 010's FR-011 (the cutover is additive) and SC-004 (zero
  # callers broken). The custom domain in edge-domain.tf is added alongside it, never instead of it.
  # The raw URL is published at /effy/<env>/edge/api_default_endpoint as the break-glass fallback.

  # Approved origins live in local.browser_origins (above), shared with the product-media bucket. A
  # service that attaches to an external HTTP API cannot configure CORS, so it lives here - a new
  # console origin is a Terraform change, not a code change. Without the deployed origin, every
  # authenticated console call fails at the options pre-flight.
  cors_configuration {
    allow_origins  = local.shared_gateway_origins
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

# One JWT authorizer per pool (Principle IV - a cross-pool token is structurally rejected).
# The back-office pool's authorizer is on the staff gateway, never here.
resource "aws_apigatewayv2_authorizer" "pool" {
  for_each = local.shared_pools

  api_id           = aws_apigatewayv2_api.edge.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${module.shared.name_prefix}-edge-${each.key}"

  jwt_configuration {
    issuer = "https://cognito-idp.${var.aws_region}.amazonaws.com/${each.value.pool_id}"
    # The pool's app clients. Customer has two (web + 013 mobile); the rest have one. A mobile token
    # carries the mobile client's id as `aud`, so it must be listed here or every mobile call 401s.
    audience = concat([each.value.client_id], each.value.extra_client_ids)
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

# The address callers should use: the platform's custom domain. The raw URL is published at
# …/edge/api_default_endpoint (edge-domain.tf).
resource "aws_ssm_parameter" "edge_api_endpoint" {
  name  = "/effy/${var.env}/edge/api_endpoint"
  type  = "String"
  value = local.api_url
  tier  = "Standard"
}

resource "aws_ssm_parameter" "edge_authorizer_id" {
  for_each = local.shared_pools

  name  = "/effy/${var.env}/edge/authorizer/${each.key}_id"
  type  = "String"
  value = aws_apigatewayv2_authorizer.pool[each.key].id
  tier  = "Standard"
}

# The API-level 5xx alarm: a server error on any route of any service behind this gateway, to the alerts
# topic. It cannot see a function no request reaches (schedules, queue or topic consumers); those are
# watched by their Effy/* metric alarms. No `ok_actions`: a burst that clears is one email.
resource "aws_cloudwatch_metric_alarm" "edge_api_5xx" {
  alarm_name          = "${module.shared.name_prefix}-edge-api-5xx"
  alarm_description   = "Requests through the shared API gateway are failing with server errors (more than 5 in 5 minutes), on any service. Open the gateway's 5xx metric by route, then that function's logs. A retryable 503 from the shopper connection limit counts here too."
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  dimensions          = { ApiId = aws_apigatewayv2_api.edge.id }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

output "edge_http_api_id" {
  description = "Shared edge HTTP API id (also in SSM /effy/<env>/edge/http_api_id)."
  value       = aws_apigatewayv2_api.edge.id
}

output "edge_api_endpoint" {
  description = "Shared edge HTTP API invoke URL (also in SSM /effy/<env>/edge/api_endpoint)."
  value       = aws_apigatewayv2_api.edge.api_endpoint
}
