output "parent_zone_id" {
  description = "Parent hosted zone id. Env roots look this zone up BY NAME (never via remote state) — see infra/envs/dev/dns.tf."
  value       = aws_route53_zone.parent.zone_id
}

output "parent_zone_name" {
  description = "The platform's registered domain."
  value       = aws_route53_zone.parent.name
}

output "name_servers" {
  description = "🧑‍💻 THE FOUR VALUES TO PASTE INTO GODADDY. Replace the registrar's name-servers with these; the registration stays at GoDaddy — you are changing AUTHORITY, not transferring the domain. Nothing downstream (ACM validation, SES DKIM) can succeed until this propagates: verify with `dig +short NS effyshopping.com`."
  value       = aws_route53_zone.parent.name_servers
}
