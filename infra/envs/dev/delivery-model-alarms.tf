# ---------------------------------------------------------------------------------------------
# Going live with the new delivery model — 083-delivery-model-cutover (Principle VII).
#
# Two things that fail nothing when they go wrong. Both metrics are CloudWatch EMF from edge-admin's
# `deliveryModelSwitchSweep` (every 5 minutes), namespace Effy/Platform, no dimensions.
#
# ⚠ MISSING DATA IS NOT BREACHING on either: the sweep emits these only while a switch is scheduled
# (the first) or on (the second), and "no switch scheduled" is the ordinary state. What says the
# sweep itself has stopped is its failed-invocation alarm (background-functions.tf).
# ---------------------------------------------------------------------------------------------

# A scheduled switch was cleared because the platform stopped being ready — a fee plan deactivated,
# the last window disabled — within ten minutes of its moment. The business expected the new model
# to start and it did not.
resource "aws_cloudwatch_metric_alarm" "delivery_model_switch_blocked" {
  alarm_name          = "${module.shared.name_prefix}-delivery-model-switch-blocked"
  alarm_description   = "083 — the scheduled switch to the new delivery model was STOPPED because the platform was not ready when its moment came. Customers are still being sold the old way. Back-office → Delivery → Go-live lists what is missing; fix it and set the moment again."
  namespace           = "Effy/Platform"
  metric_name         = "DeliveryModelSwitchBlocked"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# Orders sold the old way are still open longer after the switch than the business allows
# (`delivery_settings.legacy_orders_alert_days`, 7 by default). The old arrangement cannot be
# removed while one remains.
resource "aws_cloudwatch_metric_alarm" "legacy_orders_open_past_due" {
  alarm_name          = "${module.shared.name_prefix}-legacy-orders-open-past-due"
  alarm_description   = "083 — orders sold under the old delivery arrangement are still open past the alert age after the switch. Each needs finishing, cancelling or refunding before the old arrangement can be removed. Back-office → Delivery → Go-live → the old orders still open."
  namespace           = "Effy/Platform"
  metric_name         = "LegacyOrdersOpenPastDue"
  statistic           = "Minimum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
