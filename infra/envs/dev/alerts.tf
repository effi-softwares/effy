# Where alarms actually reach a person (037-platform-email-delivery, FR-037).
#
# ⚠ THE DEFECT THIS FIXES: this environment already had CloudWatch alarms on SES bounce rate, SES
# complaint rate, certificate expiry, and 035's four OTP metrics — and NOT ONE OF THEM HAD AN
# ACTION. No topic, no subscriber. They turn red in a console nobody is watching. Detection without
# notification is not detection; it is a dashboard.

resource "aws_sns_topic" "alerts" {
  name = "${module.shared.name_prefix}-alerts"

  tags = {
    Slice = "037-platform-email-delivery"
  }
}

# ⚠ AN EMAIL SUBSCRIPTION IS INERT UNTIL A HUMAN CLICKS THE LINK AWS SENDS.
# `terraform apply` reports success while the notification path is silently dead. For a slice whose
# entire purpose is that someone finds out, an unconfirmed subscription reproduces the exact defect
# it exists to fix — so the quickstart requires proving it afterwards:
#
#   aws sns list-subscriptions-by-topic --topic-arn <arn> \
#     --query 'Subscriptions[?SubscriptionArn==`PendingConfirmation`]'   # MUST be []
#
# Terraform also cannot delete an unconfirmed subscription: destroying it removes the resource from
# state while it continues to exist in AWS.
# ⚠ CONDITIONAL ON AN OPERATOR-SUPPLIED ADDRESS (constitution v1.12.0, Real-World Identifiers).
# Empty means the topic exists with NO subscriber — alarms still fire and still record, they simply
# page nobody. That is the correct state until someone chooses an address, and it is honest in a way
# that pointing at a plausible-looking address is not.
resource "aws_sns_topic_subscription" "alerts_email" {
  count = var.alert_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# App↔infra contract: alarms defined OUTSIDE Terraform (the per-function alarms in each service's
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
