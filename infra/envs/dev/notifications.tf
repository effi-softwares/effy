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
