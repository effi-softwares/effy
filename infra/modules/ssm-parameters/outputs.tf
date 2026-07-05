output "parameter_names" {
  description = "Map of contract key → full SSM parameter name."
  value       = { for k, p in aws_ssm_parameter.auth : k => p.name }
}

output "parameter_arns" {
  description = "Map of contract key → SSM parameter ARN (for future read-side IAM)."
  value       = { for k, p in aws_ssm_parameter.auth : k => p.arn }
}
