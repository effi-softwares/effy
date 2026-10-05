# Shared edge API Gateway (004-backend-bootstrap, plan amendment A3 — cold-path decomposition).
#
# The cost-optimized path is many independently deployable Serverless services behind ONE HTTP
# API. Terraform owns the API + the four per-pool JWT authorizers (the same layer that owns the
# Cognito pools, VPC, RDS); each service attaches by id via provider.httpApi.id and references an
# authorizer by id (research Part F, option a). CORS + the API-level 5xx alarm live here because
# a service that attaches to an external API cannot configure them.

locals {
  # audience → the pool it authorizes. Hyphenated 'back-office' matches the SSM auth path form.
  #
  # `extra_client_ids` lets a pool authorize MORE THAN ONE app client — the customer and shop pools
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
      extra_client_ids = [aws_cognito_user_pool_client.shop_mobile.id]
    }
    driver        = { pool_id = module.driver_pool.user_pool_id, client_id = module.driver_pool.app_client_id, extra_client_ids = [aws_cognito_user_pool_client.driver_mobile.id] }
    "back-office" = { pool_id = module.back_office_pool.user_pool_id, client_id = module.back_office_pool.app_client_id, extra_client_ids = [] }
  }

  # ⚠ THE ONE LIST OF BROWSER ORIGINS, consumed by this gateway's CORS **and** by the product-media
  # bucket's (media.tf). The two must agree: a console reaches the platform over BOTH — the edge API
  # for the request that mints a presigned url, and S3 DIRECTLY for the PUT that follows (the bytes
  # never pass through Lambda, 016 R9). Declaring the list twice is how they came to disagree: 048
  # added the deployed console origins here and not to the bucket, so every authenticated console
  # call worked and only the upload failed — at a pre-flight, with nothing on any server to look at.
  #
  # Localhost dev: :5173 back-office (005) · :5174 shop-web (007) · :3000 customer-web.
  # Deployed consoles (048): config-derived from the zone, never a literal, so prod supplies its own
  # zone and gets its own origins with no logic edit (FR-017/FR-020).
  browser_origins = concat(
    ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    [
      "https://${var.shop_web_subdomain}.${module.dns.zone_name}",
      "https://${var.back_office_subdomain}.${module.dns.zone_name}",
    ],
  )

  # ⚠ THE STOREFRONT'S ORIGINS — GATEWAY ONLY, deliberately NOT part of browser_origins (070).
  #
  # Until 070 the storefront's browser reached one backend directly: the always-on Go service, for
  # the three client-side catalogue fetches (search results, facets, recently viewed). Those now
  # come here, so its origin must be allowed here or every one of them fails at the pre-flight with
  # nothing on any server to look at.
  #
  # It is kept OUT of browser_origins because that list is also the product-media bucket's, and the
  # storefront never uploads: an origin that has no reason to PUT to the bucket is not given the
  # CORS grant to try.
  #
  # Config-derived from this environment's own zone — the storefront is served at the zone apex and
  # at www (amplify-customer-web.tf). ⚠ No production origin is listed in a dev gateway: the retired backend's
  # allow-list carried `effyshopping.com` "ahead of" a prod storefront, which let a prod page call
  # dev. Prod's own root derives prod's own origins from prod's zone.
  storefront_origins = [
    "https://${module.dns.zone_name}",
    "https://www.${module.dns.zone_name}",
  ]
}

resource "aws_apigatewayv2_api" "edge" {
  name          = "${module.shared.name_prefix}-edge"
  protocol_type = "HTTP"
  description   = "Effy cold-path shared HTTP API — services attach by id under /<service>/ (A3)"

  # ⚠ disable_execute_api_endpoint MUST remain false (its default). Setting it true kills the raw
  # execute-api URL — silently violating 010's FR-011 (the cutover is ADDITIVE) and SC-004 (zero
  # callers broken). The custom domain in edge-domain.tf is added ALONGSIDE it, never instead of it.
  # The raw URL is published at /effy/<env>/edge/api_default_endpoint as the break-glass fallback.

  # Approved origins live in local.browser_origins (above), shared with the product-media bucket. A
  # service that attaches to an external HTTP API cannot configure CORS, so it lives here — a new
  # console origin is a Terraform change, not a code change. Without the deployed origin, every
  # authenticated console call fails at the OPTIONS pre-flight.
  cors_configuration {
    allow_origins  = concat(local.browser_origins, local.storefront_origins)
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
    issuer = "https://cognito-idp.${var.aws_region}.amazonaws.com/${each.value.pool_id}"
    # The pool's app clients. Customer has two (web + 013 mobile); the rest have one. A mobile token
    # carries the mobile client's id as `aud`, so it MUST be listed here or every mobile call 401s.
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
#
# ⚠ THIS IS THE PLATFORM'S ONE "A ROUTE IS FAILING" ALARM, AND UNTIL 2026-10-05 IT NOTIFIED NOBODY.
# It had no action — and neither did the 78 per-function Lambda error alarms the `admin`, `shop` and
# `fleet` services declared beside it. 79 alarms, about $8 a month, and not one could reach a person.
# The 78 are deleted; this one is wired to the alerts topic. It covers a server error on ANY route of
# ANY service behind the gateway, which is what those 78 were each watching one function of.
#
# ⚠ What it does NOT see: a function no request reaches — a schedule, a queue or topic consumer.
# Those are watched by what they are for (the Effy/* metric alarms in this root), not by whether
# they threw.
#
# ⚠ `ok_actions` is deliberately absent. A burst of 5xx that clears is one email, not two; the
# alarms that carry ok_actions are the ones where "it stopped" is itself news.
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
