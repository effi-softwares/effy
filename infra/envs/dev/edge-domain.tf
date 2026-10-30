# The shared HTTP api's platform-owned address - api.dev.effyshopping.com.
#
# the point: the api's provider-generated hostname is an artifact of the resource, not a platform
# asset. Recreate the gateway (as the 2026-07-12 region relocation did) and the hostname changes,
# breaking every client that hard-coded it. An alias record in a zone we own survives that.

locals {
  api_domain = "${var.api_subdomain}.${module.dns.zone_name}" # api.dev.effyshopping.com
  api_url    = "https://${local.api_domain}"
}

resource "aws_apigatewayv2_domain_name" "edge" {
  domain_name = local.api_domain

  domain_name_configuration {
    # The wildcard cert from the dns-env-zone module. Reading.certificate_arn (rather than the
    # certificate's own arn) means this waits for ACM to report issued.
    certificate_arn = module.dns.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

# No mapping key → paths pass through untouched: api.dev.effyshopping.com/admin/v1/shops hits the
# same route as <raw>/admin/v1/shops. Every service's /<service>/v1/... scheme is preserved,
# so no serverless.yml changes.
resource "aws_apigatewayv2_api_mapping" "edge" {
  api_id      = aws_apigatewayv2_api.edge.id
  domain_name = aws_apigatewayv2_domain_name.edge.id
  stage       = aws_apigatewayv2_stage.default.id
}

# alias records (not cname) - they resolve straight to the gateway's regional target, cost nothing to
# query, and repoint transparently if the endpoint behind them is destroyed and recreated.
resource "aws_route53_record" "api_a" {
  zone_id = module.dns.zone_id
  name    = local.api_domain
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.edge.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.edge.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api_aaaa" {
  zone_id = module.dns.zone_id
  name    = local.api_domain
  type    = "AAAA"

  alias {
    name                   = aws_apigatewayv2_domain_name.edge.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.edge.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# The sending namespace must resolve: `dev.effyshopping.com` is in the From: of every code sent, and
# receivers (Microsoft, Yahoo) reject sender domains that do not resolve (RFC 5321 §2.3.5). No MX record:
# the implicit-MX rule makes an address record enough, and replies route to hello@. If Outlook still
# rejects, add the MX record first.
#
# These apex aliases point at the edge gateway only so the name resolves. At the storefront cutover
# (var.amplify_domain_enabled = true) they are removed (count → 0) and Amplify's apex record takes over,
# with no window. The `api.` record is unaffected.
resource "aws_route53_record" "zone_apex_a" {
  count   = var.amplify_domain_enabled ? 0 : 1
  zone_id = module.dns.zone_id
  name    = module.dns.zone_name
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.edge.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.edge.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "zone_apex_aaaa" {
  count   = var.amplify_domain_enabled ? 0 : 1
  zone_id = module.dns.zone_id
  name    = module.dns.zone_name
  type    = "AAAA"

  alias {
    name                   = aws_apigatewayv2_domain_name.edge.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.edge.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# The raw execute-api URL, published rather than left as folklore.
#
# It is not deprecated. It is the fallback that makes the cutover additive and the
# propagation window survivable (SC-004: zero callers broken). Publishing it under its own key means
# break-glass does not require someone to remember what the old hostname was.
resource "aws_ssm_parameter" "edge_api_default_endpoint" {
  name  = "/effy/${var.env}/edge/api_default_endpoint"
  type  = "String"
  value = aws_apigatewayv2_api.edge.api_endpoint
  tier  = "Standard"
}

output "edge_api_custom_domain" {
  description = "The platform-owned API address (also in SSM /effy/<env>/edge/api_endpoint)."
  value       = local.api_url
}
