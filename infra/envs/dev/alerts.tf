# Where alarms reach a person: the alerts topic every alarm in this root notifies. An alarm with no action
# turns red in a console nobody watches.

resource "aws_sns_topic" "alerts" {
  name = "${module.shared.name_prefix}-alerts"

  tags = {
    Slice = "037-platform-email-delivery"
  }
}

# An email subscription is inert until someone clicks the link AWS sends, and `terraform apply` reports
# success either way. Prove it afterwards:
#
# aws sns list-subscriptions-by-topic --topic-arn <arn> \
# --query 'Subscriptions[?SubscriptionArn==`PendingConfirmation`]' # must be []
#
# Terraform cannot delete an unconfirmed subscription (destroy removes it from state only). Conditional on
# an operator-supplied address: empty means the topic has no subscriber (alarms fire and record, paging
# nobody) until someone chooses one.
resource "aws_sns_topic_subscription" "alerts_email" {
  count = var.alert_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# App↔infra contract: alarms defined outside Terraform (the per-function alarms in each service's
# serverless.yml) read the topic from here rather than hardcoding an ARN.
resource "aws_ssm_parameter" "alerts_topic_arn" {
  name        = "/effy/${var.env}/alerts/topic_arn"
  description = "SNS topic every operator alarm notifies. Read by serverless.yml alarm definitions."
  type        = "String"
  value       = aws_sns_topic.alerts.arn
  tier        = "Standard"
}

output "alerts_topic_arn" {
  description = "The operator alert topic. ⚠ If an email endpoint is set, check the subscription is CONFIRMED — an unconfirmed one notifies nobody while looking perfectly healthy."
  value       = aws_sns_topic.alerts.arn
}

output "alerts_endpoint_configured" {
  description = "⚠ false means every alarm in this environment currently pages NOBODY. Set alert_email in this env's tfvars — the value must be operator-chosen."
  value       = var.alert_email != ""
}
