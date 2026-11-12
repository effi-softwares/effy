# 114 Hold stock at checkout (specs/114-checkout-stock-holds).
#
# A payment that lands after its checkout hold ran out takes only stock no other shopper holds; anything missing goes
# through the short-order path (the pick line pre-flagged, a refund proposed). A few a day means the hold time is too
# short for how long people take to pay - raise it on back-office › Settings › Clean-ups. The metric is emitted in the
# money namespace by `meterFinalize` (@effy/edge-shared/payments), whichever service took the payment.
resource "aws_cloudwatch_metric_alarm" "stock_hold_late_short" {
  alarm_name          = "${module.shared.name_prefix}-stock-hold-late-short"
  alarm_description   = "Three or more paid orders in a day were short because the payment arrived after its checkout stock hold ran out. Consider a longer hold time (back-office › Settings › Clean-ups) and check the orders' pick lines."
  namespace           = "Effy/Commerce"
  metric_name         = "StockHoldLate"
  dimensions          = { outcome = "short" }
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = {
    Slice = "114-checkout-stock-holds"
  }
}
