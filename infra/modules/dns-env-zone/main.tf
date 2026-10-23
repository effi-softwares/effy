# One environment's DNS namespace, end to end: the child zone, its delegation, and the wildcard
# certificate every endpoint in that environment will use.
#
# Instantiating this with `env = "qa"` is the whole of "add a new environment".

locals {
  # dev + effyshopping.com → dev.effyshopping.com
  zone_name = "${var.env}.${var.parent_domain}"

  # one label under the namespace. The wildcard below matches exactly one label:
  # api.dev.effyshopping.com ✅ a.b.dev.effyshopping.com ❌ (would need its own certificate).
  wildcard = "*.${local.zone_name}"
}

# ── The environment's own zone ────────────────────────────────────────────────────────────────
resource "aws_route53_zone" "env" {
  name    = local.zone_name
  comment = "Effy ${var.env} namespace — delegated from ${var.parent_domain} (010)."
  tags    = var.tags
}

# The delegation record, the only record an environment writes outside its own zone. It lives in the
# environment's state, so destroying the env removes the delegation and its zone together: no dangling NS
# record for a third party to claim.
resource "aws_route53_record" "delegation" {
  zone_id = var.parent_zone_id
  name    = local.zone_name
  type    = "NS"
  ttl     = 172800 # 48h — the conventional TTL for a delegation
  records = aws_route53_zone.env.name_servers
}

# The wildcard certificate, one per environment: covers every `<name>.<env>…` with no re-issue. Created in
# the provider's region because it fronts the regional API Gateway; anything behind CloudFront/Amplify needs
# a us-east-1 certificate.
resource "aws_acm_certificate" "wildcard" {
  domain_name       = local.wildcard
  validation_method = "DNS"
  tags              = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

# Validation records, in the env's own zone → validation and renewal are fully automatic.
#
# the renewal trap: ACM renews automatically only while this record still resolves. Delete it and
# nothing breaks — until the certificate silently fails to renew and the endpoint goes untrusted at
# expiry. The DaysToExpiry alarm in the env root exists to catch exactly that.
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.wildcard.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id         = aws_route53_zone.env.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

# Blocks the apply until ACM reports issued.
#
# This is the step that fails (after a 45-minute wait) if the registrar has not yet been
# repointed: ACM validates by publicly resolving the record above, which requires the parent to
# delegate to this zone, which requires GoDaddy to point at the parent zone.
resource "aws_acm_certificate_validation" "wildcard" {
  certificate_arn         = aws_acm_certificate.wildcard.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}
