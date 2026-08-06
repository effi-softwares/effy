output "identity_arn" {
  description = "ARN of the SES domain identity — Cognito's email_configuration.source_arn."
  value       = aws_sesv2_email_identity.this.arn
}

output "domain" {
  description = "The verified sending domain."
  value       = var.domain
}

output "from_address" {
  description = <<-EOT
    The platform's sender for this environment — the ONE definition every sender reads, published to
    /effy/<env>/ses/sender by the env root (037 FR-004/FR-005).

    ⚠ 010's FR-022 said no reply-to could exist because the platform could not receive mail. That is
    no longer true: the apex now routes to the operator's mailbox, so 037's FR-022 REVERSES it and a
    reply address is configured alongside this one. A reply that reaches a person beats a reply that
    vanishes; a reply that BOUNCES is what the original rule was protecting against.
  EOT
  value       = "Effy <no-reply@${var.domain}>"
}

output "mail_from_domain" {
  description = "Custom MAIL FROM subdomain — makes SPF align to the platform's domain rather than amazonses.com."
  value       = local.mail_from_domain
}
