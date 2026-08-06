output "configuration_set_name" {
  description = "Name of the configuration set. Set as the identity's default AND passed explicitly by every sender — see research R2 for why both."
  value       = aws_sesv2_configuration_set.this.configuration_set_name
}

output "configuration_set_arn" {
  description = "ARN of the configuration set."
  value       = aws_sesv2_configuration_set.this.arn
}

output "events_topic_arn" {
  description = "SNS topic carrying per-message delivery outcomes. The consumer subscribes to this from serverless.yml, reading it via the SSM contract."
  value       = aws_sns_topic.events.arn
}
