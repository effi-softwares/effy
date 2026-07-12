output "user_pool_id" {
  description = "Pool id, e.g. ap-southeast-2_ABC123."
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "Pool ARN."
  value       = aws_cognito_user_pool.this.arn
}

output "user_pool_endpoint" {
  description = "Issuer host — per-pool JWT validation pins this in a later backend slice."
  value       = aws_cognito_user_pool.this.endpoint
}

output "app_client_id" {
  description = "The (public) app client id."
  value       = aws_cognito_user_pool_client.this.id
}

output "app_client_ids" {
  description = "Map of client name → id (room for additional clients later)."
  value = {
    (aws_cognito_user_pool_client.this.name) = aws_cognito_user_pool_client.this.id
  }
}
