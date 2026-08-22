output "app_id" {
  description = "The Amplify app id."
  value       = aws_amplify_app.this.id
}

output "app_arn" {
  description = "The Amplify app ARN — used to scope the build-status EventBridge rule in the env root."
  value       = aws_amplify_app.this.arn
}

output "default_domain" {
  description = "Amplify's provider-generated hostname (…​.amplifyapp.com). The stage-A verification target before the custom domain is attached."
  value       = aws_amplify_app.this.default_domain
}

output "branch_name" {
  description = "The connected auto-deploy branch."
  value       = aws_amplify_branch.this.branch_name
}

output "storefront_url" {
  description = "The public URL once the custom domain is attached (apex or subdomain per subdomain_prefix), else the Amplify default hostname."
  value = (
    var.domain_name == ""
    ? "https://${aws_amplify_app.this.default_domain}"
    : "https://${var.subdomain_prefix != "" ? "${var.subdomain_prefix}." : ""}${var.domain_name}"
  )
}
