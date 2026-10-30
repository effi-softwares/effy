# Push notifications (FCM, sent by the notifications worker). Terraform owns the FCM service-account secret
# container and the non-secret project id, and publishes the secret's ARN to SSM so the worker's
# serverless.yml can scope its read grant (as otp-store.tf does). The worker's IAM is in its serverless.yml.

# The FCM service-account JSON (HTTP v1 auth for the sender). Secret - seeded by the operator, never by
# Terraform (Real-World Identifiers): Terraform creates the empty container; `quickstart.md §A1` puts
# the value. Same posture as the OTP HMAC secret.
resource "aws_secretsmanager_secret" "fcm_service_account" {
  name        = "${module.shared.name_prefix}-fcm-service-account"
  description = "050 - FCM service-account JSON for the notifications worker's HTTP v1 sender. Seeded by the operator, never by Terraform. Read only by the notifications worker."

  # Dev convenience only: lets `make destroy ENV=dev` reclaim the name.
  recovery_window_in_days = 0
}

resource "aws_ssm_parameter" "fcm_service_account_arn" {
  name  = "/effy/${var.env}/notifications/fcm_service_account_arn"
  type  = "String"
  value = aws_secretsmanager_secret.fcm_service_account.arn
  tier  = "Standard"
}

# The Firebase project id (non-secret) - the sender targets this project.
# count guard: SSM rejects an empty String, and this is unset until backend push is wired. Absent
# param ⇒ the worker no-ops (fail-open, FR-027); set var.fcm_project_id to create it.
resource "aws_ssm_parameter" "fcm_project_id" {
  count = var.fcm_project_id != "" ? 1 : 0
  name  = "/effy/${var.env}/notifications/fcm_project_id"
  type  = "String"
  value = var.fcm_project_id
  tier  = "Standard"
}

# Page on sustained push send failures (Principle VII). The worker emits the metric via
# CloudWatch EMF on stdout (no metric-filter/log-group dependency, same as the 035 triggers), so this
# is a plain alarm on the emitted metric routed to the existing alerts SNS topic (alerts.tf).
resource "aws_cloudwatch_metric_alarm" "notification_send_failed" {
  alarm_name          = "${module.shared.name_prefix}-notification-send-failed"
  alarm_description   = "050 - push notifications are failing to send. Check FCM credentials, the worker log, and device-token health."
  namespace           = "Effy/Notifications"
  metric_name         = "NotificationSendFailed"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# Sustained receipt-email send failures. A missing receipt is invisible to everyone (the order looks
# healthy). The threshold (3) is below push's (10): push has a baseline of stale tokens; a refused email
# does not.
resource "aws_cloudwatch_metric_alarm" "receipt_send_failed" {
  alarm_name          = "${module.shared.name_prefix}-receipt-send-failed"
  alarm_description   = "052 - order receipts are failing to send. Check the SES identity + configuration set grant, MAIL_* config, and public.receipt_dispatch.last_error."
  namespace           = "Effy/Notifications"
  metric_name         = "ReceiptSendFailed"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 3
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# Sustained arrival-email send failures: the only message a web-only shopper gets about their delivery
# (ready, out for delivery, delivered). Threshold as the receipt alarm (3).
resource "aws_cloudwatch_metric_alarm" "notification_email_send_failed" {
  alarm_name          = "${module.shared.name_prefix}-notification-email-send-failed"
  alarm_description   = "053 - order-arrival emails are failing to send. Check the SES identity + configuration set grant, MAIL_* config, and public.notification_request.last_error WHERE channel='email'."
  namespace           = "Effy/Notifications"
  metric_name         = "NotificationEmailSendFailed"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 3
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
