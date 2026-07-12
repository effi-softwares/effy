output "zone_id" {
  description = "This environment's hosted zone id — every record the env owns goes here."
  value       = aws_route53_zone.env.zone_id
}

output "zone_name" {
  description = "This environment's namespace (e.g. dev.effyshopping.com)."
  value       = local.zone_name
}

output "name_servers" {
  description = "The child zone's name-servers (already wired into the parent's delegation record — informational)."
  value       = aws_route53_zone.env.name_servers
}

output "certificate_arn" {
  description = "The VALIDATED wildcard certificate for *.<env>.<parent_domain>. Depends on aws_acm_certificate_validation, so consuming it guarantees the cert is ISSUED."
  value       = aws_acm_certificate_validation.wildcard.certificate_arn
}
