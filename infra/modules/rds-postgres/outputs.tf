output "endpoint" {
  description = "Instance hostname (no port) — published to /effy/<env>/db/endpoint."
  value       = aws_db_instance.db.address
}

output "port" {
  description = "PostgreSQL port."
  value       = aws_db_instance.db.port
}

output "db_name" {
  description = "Initial database name."
  value       = aws_db_instance.db.db_name
}

output "master_username" {
  description = "Master username (the password lives ONLY in the managed secret)."
  value       = aws_db_instance.db.username
}

output "master_secret_arn" {
  description = "Secrets Manager ARN of the RDS-managed master secret — a pointer, published to SSM; consumers fetch the value with their own IAM."
  value       = aws_db_instance.db.master_user_secret[0].secret_arn
}

output "security_group_id" {
  description = "The instance's SG — future consumer slices add SG-to-SG ingress rules against this."
  value       = aws_security_group.db.id
}

output "instance_identifier" {
  description = "RDS instance identifier (effy-<env>-db)."
  value       = aws_db_instance.db.identifier
}

output "instance_arn" {
  description = "Instance ARN (billing/tag tooling)."
  value       = aws_db_instance.db.arn
}
