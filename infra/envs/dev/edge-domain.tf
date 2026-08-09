# The shared HTTP API's platform-owned address — api.dev.effyshopping.com (010, spec US2).
#
# THE POINT: the API's provider-generated hostname is an artifact of the RESOURCE, not a platform
# asset. Recreate the gateway (as the 2026-07-12 region relocation did) and the hostname changes,
# breaking every client that hard-coded it. An alias record in a zone we own survives that.

locals {
  api_domain = "${var.api_subdomain}.${module.dns.zone_name}" # api.dev.effyshopping.com
  api_url    = "https://${local.api_domain}"
}

resource "aws_apigatewayv2_domain_name" "edge" {
  domain_name = local.api_domain

  domain_name_configuration {
    # The wildcard cert from the dns-env-zone module. Reading .certificate_arn (rather than the
    # certificate's own arn) means this waits for ACM to report ISSUED.
    certificate_arn = module.dns.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

# No mapping key → paths pass through untouched: api.dev.effyshopping.com/admin/v1/shops hits the
# same route as <raw>/admin/v1/shops. Every service's /<service>/v1/... scheme (004) is preserved,
# so no serverless.yml changes.
resource "aws_apigatewayv2_api_mapping" "edge" {
  api_id      = aws_apigatewayv2_api.edge.id
  domain_name = aws_apigatewayv2_domain_name.edge.id
  stage       = aws_apigatewayv2_stage.default.id
}

# ALIAS records (not CNAME) — they resolve straight to the gateway's regional target, cost nothing to
# query, and repoint transparently if the endpoint behind them is destroyed and recreated (FR-012).
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

# ── The sending namespace must RESOLVE (037 FR-013 / SC-006) ─────────────────────────────────
#
# ⚠ `dev.effyshopping.com` is the domain in the visible From: of every code this platform sends, and
# until now it had NO address record and no mail-exchanger record — it did not resolve at all.
# RFC 5321 §2.3.5 requires a sender domain to exist and be queryable, and Microsoft and Yahoo are
# both reported to reject outright on sender domains that do not. That is the most likely cause of
# silent partial delivery, and it is invisible from our side.
#
# ⚠ THIS IS NOT A WEBSITE, and the slice does not pretend otherwise. It aliases the same gateway
# `edge-api.dev` uses, so the name resolves and serves API 404s. A real landing page is out of scope.
#
# ⚠ NO MAIL-EXCHANGER RECORD, deliberately (research R5). RFC 5321's implicit-MX rule makes a host
# with an address record mail-routable without one, and adding one would mean registering this
# namespace with the operator's mail service and then accepting mail nobody reads — while replies
# already route to hello@ (FR-022). If SC-004/SC-005 show Outlook still rejecting, the remedy is
# pre-decided: add the mail-exchanger record. Do not guess at other causes first.
# ⚠ RECONCILED BY 042 (customer-web CI/CD, FR-012). These apex aliases pointed dev.effyshopping.com
# at the edge API gateway ONLY so the email sender domain resolves (above). The customer storefront
# now takes over the apex: at the cutover apply (var.amplify_domain_enabled = true) these records are
# REMOVED (count → 0) so Amplify can claim the apex, and Amplify's own apex record keeps the name
# resolving — so the sender-domain-resolves property is preserved with NO window (FR-011/SC-009).
# Before cutover (stage A) they remain, so the apex still resolves during first-build verification.
# ⚠ The `api.`/`core-api.` subdomain records are UNAFFECTED — only the bare apex changes.
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

# The raw execute-api URL, PUBLISHED rather than left as folklore.
#
# It is NOT deprecated. It is the fallback that makes the cutover additive (FR-011) and the
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
