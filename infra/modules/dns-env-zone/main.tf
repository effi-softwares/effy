# One environment's DNS namespace, end to end: the child zone, its delegation, and the wildcard
# certificate every endpoint in that environment will use.
#
# Instantiating this with `env = "qa"` is the whole of "add a new environment" (spec FR-007).

locals {
  # dev + effyshopping.com → dev.effyshopping.com
  zone_name = "${var.env}.${var.parent_domain}"

  # ONE label under the namespace. The wildcard below matches exactly one label:
  # api.dev.effyshopping.com ✅   a.b.dev.effyshopping.com ❌ (would need its own certificate).
  wildcard = "*.${local.zone_name}"
}

# ── The environment's own zone ────────────────────────────────────────────────────────────────
resource "aws_route53_zone" "env" {
  name    = local.zone_name
  comment = "Effy ${var.env} namespace — delegated from ${var.parent_domain} (010)."
  tags    = var.tags
}

# ── The delegation record, written INTO THE PARENT ────────────────────────────────────────────
# This is the ONLY record an environment writes outside its own zone.
#
# It deliberately lives in the ENVIRONMENT's state, not the parent's. That is what makes
# `terraform destroy` on an env remove the delegation and the zone it points at in ONE operation —
# a zone can never outlive its delegation, so there is no dangling NS record for a third party to
# claim (spec FR-005 / SC-008, the subdomain-takeover hole). The ownership split exists for this.
resource "aws_route53_record" "delegation" {
  zone_id = var.parent_zone_id
  name    = local.zone_name
  type    = "NS"
  ttl     = 172800 # 48h — the conventional TTL for a delegation
  records = aws_route53_zone.env.name_servers
}

# ── The wildcard certificate ──────────────────────────────────────────────────────────────────
# One per environment. Covers api.<env>… today and back-office./shop./core.<env>… when those slices
# land — with NO re-issue and NO new validation wait. That is FR-007 at the certificate layer.
#
# REGION: this is created in the provider's region (ap-southeast-2) because it fronts the REGIONAL
# API Gateway. Anything behind CloudFront/Amplify needs a SEPARATE us-east-1 certificate — a
# region-pinned value Terraform's single var.aws_region knob does NOT cover (010 research R2).
resource "aws_acm_certificate" "wildcard" {
  domain_name       = local.wildcard
  validation_method = "DNS"
  tags              = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

# Validation records, in the env's OWN zone → validation and renewal are fully automatic.
#
# ⚠ THE RENEWAL TRAP: ACM renews automatically only while this record still resolves. Delete it and
# nothing breaks — until the certificate silently fails to renew and the endpoint goes untrusted at
# expiry. The DaysToExpiry alarm in the env root exists to catch exactly that (research R9).
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

# Blocks the apply until ACM reports ISSUED.
#
# ⚠ This is the step that FAILS (after a 45-minute wait) if the registrar has not yet been
# repointed: ACM validates by PUBLICLY RESOLVING the record above, which requires the parent to
# delegate to this zone, which requires GoDaddy to point at the parent zone (research R6).
resource "aws_acm_certificate_validation" "wildcard" {
  certificate_arn         = aws_acm_certificate.wildcard.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}
