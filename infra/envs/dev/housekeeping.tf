# 113 - Data lifecycle: the clean-ups that run by themselves (Settings › Clean-ups in back-office).
#
#   unpaid_orders        commerce  `unpaidOrders`     every 15 minutes
#   account_erasure      customer  `accountErasure`   hourly
#   phone_registrations  notifications `purge`        daily
#
# Each function's own error alarm is in background-functions.tf. This file adds what an error alarm cannot see:
# a clean-up that has stopped running, an account that keeps failing to erase, and money returned because a payment
# arrived for an order already closed. Every clean-up metric is in ONE namespace (`HOUSEKEEPING_METRIC_NAMESPACE`,
# @effy/edge-shared lib/housekeeping.ts), whichever service emits it.
#
# ⚠ The staleness bounds here are the page's bounds (`HOUSEKEEPING_JOBS[].staleAfterMinutes` in
# @effy/shared-types housekeeping.ts): 60 minutes, 2 hours, 26 hours. Change one, change both.
# ⚠ Like every staleness alarm, these fire while the database is stopped (stop-db.sh): no run, no metric.

locals {
  housekeeping_namespace = "Effy/Housekeeping"

  # job = { period (s), consecutive empty periods before it pages, what stops }
  housekeeping_stale = {
    unpaid_orders = {
      period  = 900
      periods = 4
      stops   = "Unpaid orders are no longer being closed: points, promotion codes and delivery places stay held, and customers see stale \"awaiting payment\" orders."
    }
    account_erasure = {
      period  = 3600
      periods = 2
      stops   = "Deleted accounts are no longer being erased on the date customers were told - a legal promise (034 FR-040) is being broken."
    }
    phone_registrations = {
      period  = 3600
      periods = 26
      stops   = "Old phone registrations are no longer being removed; Effy keeps sending to phones that are gone."
    }
  }
}

# The fingerprint key for a barred account's email and phone at erasure (113 FR-016).
#
# Terraform creates the shell and never the value, for the same reason as otp-store.tf: a `random_password` would put
# the key into state in plaintext. The operator seeds it once per environment:
#
#   aws secretsmanager put-secret-value --profile ef --region ap-southeast-2 \
#     --secret-id effy-dev-erasure-fingerprint-key \
#     --secret-string "{\"key\":\"$(openssl rand -hex 32)\"}"
#
# Until it is seeded, erasure still erases (the promise to the customer comes first), keeps no fingerprint for a barred
# account, and marks its run "partly worked" on the Clean-ups page.
resource "aws_secretsmanager_secret" "erasure_fingerprint_key" {
  name        = "${module.shared.name_prefix}-erasure-fingerprint-key"
  description = "113 - keys the fingerprint of a barred, erased customer's email and phone. Seeded by the operator, never by Terraform. Read only by the customer service."

  # Dev convenience only: lets `make destroy ENV=dev` actually reclaim the name.
  recovery_window_in_days = 0
}

resource "aws_ssm_parameter" "erasure_fingerprint_key_arn" {
  name  = "/effy/${var.env}/customer/erasure_fingerprint_key_arn"
  type  = "String"
  value = aws_secretsmanager_secret.erasure_fingerprint_key.arn
  tier  = "Standard"
}

# A clean-up that has stopped running: no `HousekeepingRan` for its job across the bound. A failed run emits
# `HousekeepingFailed` instead, so it counts as not run here too (and pages through the error alarm as well).
resource "aws_cloudwatch_metric_alarm" "housekeeping_stale" {
  for_each = local.housekeeping_stale

  alarm_name          = "${module.shared.name_prefix}-housekeeping-${replace(each.key, "_", "-")}-stale"
  alarm_description   = "The ${each.key} clean-up has not run successfully for ${each.value.period * each.value.periods / 60} minutes. ${each.value.stops} See back-office › Settings › Clean-ups. (Expected while the database is stopped.)"
  namespace           = local.housekeeping_namespace
  metric_name         = "HousekeepingRan"
  dimensions          = { job = each.key }
  statistic           = "Sum"
  period              = each.value.period
  evaluation_periods  = each.value.periods
  datapoints_to_alarm = each.value.periods
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = {
    Slice = "113-data-lifecycle"
  }
}

# One account that fails every run: each run is "partly worked" and nothing throws, so no error or staleness alarm
# would ever see it.
resource "aws_cloudwatch_metric_alarm" "account_erasure_retried" {
  alarm_name          = "${module.shared.name_prefix}-account-erasure-retried"
  alarm_description   = "An account has failed to erase three runs in a row, so a customer's deletion is overdue. The failing step is on back-office › Settings › Clean-ups (Account erasure); logs: /aws/lambda/effy-edge-customer-${var.env}-accountErasure."
  namespace           = local.housekeeping_namespace
  metric_name         = "AccountErasureRetried"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = {
    Slice = "113-data-lifecycle"
  }
}

# A payment arrived for an order already closed and was refunded in full (113 FR-005). With the clean-up cancelling the
# payment first this should never happen; when it does, someone should know why. Money metrics share one namespace.
resource "aws_cloudwatch_metric_alarm" "unplaced_payment_refunded" {
  alarm_name          = "${module.shared.name_prefix}-unplaced-payment-refunded"
  alarm_description   = "A customer paid for an order that had already been closed as unpaid, and the payment was refunded automatically. Check the order on back-office › Settings › Clean-ups (activity) and the commerce webhook logs."
  namespace           = "Effy/Commerce"
  metric_name         = "UnplacedPaymentRefunded"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = {
    Slice = "113-data-lifecycle"
  }
}
