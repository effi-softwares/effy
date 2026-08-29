# ---------------------------------------------------------------------------------------------
# Push notifications — 050-observability-push-foundation (FCM via the cold-path notifications worker).
# Contract: specs/050-observability-push-foundation/contracts/config.contract.md
#
# Terraform owns the FCM service-account SECRET CONTAINER and the non-secret project id, and publishes
# the secret ARN to SSM so the worker's serverless.yml can scope its own read grant to it (the exact
# otp-store.tf pattern). The worker's IAM lives in apis/edge-api/notifications/serverless.yml, like
# every other edge service — not here.
# ---------------------------------------------------------------------------------------------

# The FCM service-account JSON (HTTP v1 auth for the sender). SECRET — SEEDED BY THE OPERATOR, never by
# Terraform (Real-World Identifiers): Terraform creates the empty container; `quickstart.md §A1` puts
# the value. Same posture as the OTP HMAC secret.
resource "aws_secretsmanager_secret" "fcm_service_account" {
  name        = "${module.shared.name_prefix}-fcm-service-account"
  description = "050 — FCM service-account JSON for the notifications worker's HTTP v1 sender. Seeded by the operator, never by Terraform. Read only by the notifications worker."

  # Dev convenience only: lets `make destroy ENV=dev` reclaim the name.
  recovery_window_in_days = 0
}

resource "aws_ssm_parameter" "fcm_service_account_arn" {
  name  = "/effy/${var.env}/notifications/fcm_service_account_arn"
  type  = "String"
  value = aws_secretsmanager_secret.fcm_service_account.arn
  tier  = "Standard"
}

# The Firebase project id (non-secret) — the sender targets this project.
# ⚠ count guard: SSM rejects an empty String, and this is unset until backend push is wired. Absent
# param ⇒ the worker no-ops (fail-open, FR-027); set var.fcm_project_id to create it.
resource "aws_ssm_parameter" "fcm_project_id" {
  count = var.fcm_project_id != "" ? 1 : 0
  name  = "/effy/${var.env}/notifications/fcm_project_id"
  type  = "String"
  value = var.fcm_project_id
  tier  = "Standard"
}

# T056 — page on sustained push send failures (Principle VII). The worker emits the metric via
# CloudWatch EMF on stdout (no metric-filter/log-group dependency, same as the 035 triggers), so this
# is a plain alarm on the emitted metric routed to the existing alerts SNS topic (alerts.tf).
resource "aws_cloudwatch_metric_alarm" "notification_send_failed" {
  alarm_name          = "${module.shared.name_prefix}-notification-send-failed"
  alarm_description   = "050 — push notifications are failing to send. Check FCM credentials, the worker log, and device-token health."
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

# 052 T058 — page on sustained RECEIPT-EMAIL send failures (Principle VII).
#
# ⚠ THIS ALARM IS IN SCOPE ON PURPOSE, where two earlier slices deferred theirs. Both 038 and 046
# declined a send-failure alarm with the rationale "the service already logs it"; deferring a third
# time would make the exception the rule. The case is stronger here than for either of them: a missing
# receipt is INVISIBLE TO EVERYONE. The shopper assumes it is coming, the order is already paid and
# looks healthy, and nothing on the platform notices until somebody complains — which is precisely the
# failure mode an alarm exists for.
#
# The threshold is deliberately LOWER than the push alarm's (10). Push has a legitimate baseline of
# failures — stale device tokens, uninstalled apps — while a failing receipt send means SES refused
# something the platform believed it could send. A handful is already worth a look.
resource "aws_cloudwatch_metric_alarm" "receipt_send_failed" {
  alarm_name          = "${module.shared.name_prefix}-receipt-send-failed"
  alarm_description   = "052 — order receipts are failing to send. Check the SES identity + configuration set grant, MAIL_* config, and public.receipt_dispatch.last_error."
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

# 053 T068 — page on sustained ARRIVAL-EMAIL send failures (Principle VII).
#
# ⚠ NOT DEFERRED, and the reason is narrower than 052's. 038 and 046 both declined a send-failure
# alarm with "the service already logs it"; 052 broke that habit for the receipt. This one guards the
# ONLY message a web-only shopper gets about their delivery.
#
# Until 053 the three post-payment lifecycle events (ready, out for delivery, delivered) were PUSH
# ONLY, so the entire customer-web audience — the platform's only public surface — heard nothing
# after the receipt. If this email stops sending, that audience is back to silence and NOTHING else
# notices: the order looks healthy, the arrival is recorded, and the only symptom is a customer who
# does not know their shopping came.
#
# Threshold matches the receipt alarm (3) rather than the push alarm (10). Push has a legitimate
# baseline of failures — stale device tokens, uninstalled apps. An email that SES refused does not.
resource "aws_cloudwatch_metric_alarm" "notification_email_send_failed" {
  alarm_name          = "${module.shared.name_prefix}-notification-email-send-failed"
  alarm_description   = "053 — order-arrival emails are failing to send. Check the SES identity + configuration set grant, MAIL_* config, and public.notification_request.last_error WHERE channel='email'."
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
