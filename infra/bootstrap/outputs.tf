output "state_bucket_name" {
  description = "Name of the state bucket — referenced literally by every infra/envs/*/backend.tf."
  value       = aws_s3_bucket.tfstate.bucket
}

output "state_bucket_arn" {
  description = "ARN of the state bucket."
  value       = aws_s3_bucket.tfstate.arn
}
