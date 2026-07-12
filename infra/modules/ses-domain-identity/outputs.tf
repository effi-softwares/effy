output "identity_arn" {
  description = "ARN of the SES domain identity — Cognito's email_configuration.source_arn."
  value       = aws_sesv2_email_identity.this.arn
}

output "domain" {
  description = "The verified sending domain."
  value       = var.domain
}

output "from_address" {
  description = "The platform's no-reply sender for this environment. NO reply-to is configured: the platform cannot RECEIVE mail, and an address that bounces replies is worse than none (spec FR-022)."
  value       = "Effy <no-reply@${var.domain}>"
}

output "mail_from_domain" {
  description = "Custom MAIL FROM subdomain — makes SPF align to the platform's domain rather than amazonses.com."
  value       = local.mail_from_domain
}
