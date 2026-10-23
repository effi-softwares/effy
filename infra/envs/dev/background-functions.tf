# Alarms on scheduled functions, which no request reaches. Each is watched by what it is for, but those
# signals are emitted by the function: one that throws first emits nothing, and "no data" reads as healthy.
# So each gets the one alarm that does not depend on its own code: its count of invocations that errored.
#
# A failure must repeat across the window to page (a single cold-connection failure recovers a minute
# later). No `ok_actions`: they all fire while the database is stopped (stop-db.sh), and recoveries would
# double the mail.
#
# Function names are a contract with each serverless.yml (`<service>-<stage>-<function key>`): renaming one
# there silently disarms its alarm here. Not listed (they have their own error alarms): `insightsRollup`
# (insights.tf) and admin's `sesEventConsumer` / `sesIdentityHealth`. Cognito triggers are not scheduled.

locals {
  # key = { function, period (s), periods, threshold (errors per period, >=), what stops }
  background_function_alarms = {
    refund-reconcile = {
      function  = "effy-edge-commerce-${var.env}-refundReconcile"
      period    = 300
      periods   = 3
      threshold = 1
      stops     = "Refunds whose submission to the payment provider got no answer are no longer being resolved, and the refund-stuck alarm cannot see them because this function is what reports them. A customer may be owed money nobody is sending."
    }
    points-expiry = {
      function  = "effy-edge-customer-${var.env}-pointsExpiry"
      period    = 86400
      periods   = 1
      threshold = 1
      stops     = "074 - expired points are no longer being recorded in customers' history, and nobody is being warned before their points expire. Expired points still cannot be spent (the balance does not depend on this job)."
    }
    points-reconcile = {
      function  = "effy-edge-customer-${var.env}-pointsReconcile"
      period    = 3600
      periods   = 2
      threshold = 1
      stops     = "074 - the points ledger is no longer being checked, and the points-ledger alarm cannot see a fault because this function is what reports it."
    }
    notification-drain = {
      function  = "effy-edge-notifications-${var.env}-drain"
      period    = 300
      periods   = 2
      threshold = 3
      stops     = "Push and email notifications are queuing and not being sent: new-order alerts to shops, order updates to customers."
    }
    receipt-drain = {
      function  = "effy-edge-notifications-${var.env}-receiptDrain"
      period    = 300
      periods   = 2
      threshold = 3
      stops     = "Order receipts are queuing and not being emailed. Paid orders are unaffected; customers are not getting their receipt."
    }
    wave-planner = {
      function  = "effy-edge-fleet-${var.env}-planWavesScheduled"
      period    = 300
      periods   = 3
      threshold = 1
      stops     = "Collection and delivery work is not being assigned to drivers. Packages that become ready stay unplanned, and the dispatch alarms cannot see it because this function is what reports them."
    }
    attention-evaluate = {
      function  = "effy-edge-shop-${var.env}-attentionEvaluate"
      period    = 300
      periods   = 3
      threshold = 1
      stops     = "Shop staff are no longer being told about work that is ageing — orders waiting to be picked, stock running out. Nothing else reports this."
    }
    insights-reconcile = {
      function  = "effy-edge-shop-${var.env}-insightsReconcile"
      period    = 3600
      periods   = 1
      threshold = 1
      stops     = "The nightly check that recomputes each shop's figures did not complete. Insights may be carrying an error that tonight's run would have corrected."
    }
    gateway-usage = {
      function  = "effy-edge-admin-${var.env}-gatewayUsage"
      period    = 3600
      periods   = 2
      threshold = 1
      stops     = "075 - nobody is counting how full the two API gateways are, so the gateway-usage alarms cannot fire. A gateway that fills up refuses the next deployment. This function does not use the database: check its permission to read the gateways."
    }
    review-queue-age = {
      function  = "effy-edge-catalog-${var.env}-reviewQueueAge"
      period    = 900
      periods   = 2
      threshold = 1
      stops     = "The age of the product review queue is no longer being measured, so the stale-review alarm cannot fire."
    }
    courier-late-sweep = {
      function  = "effy-edge-orders-${var.env}-courierLateSweep"
      period    = 1800
      periods   = 2
      threshold = 1
      stops     = "080 - late courier parcels (at the hub, at a supplier, with the courier) are no longer being counted, so the courier-late alarms cannot fire on a real parcel (they will fire on the missing data instead)."
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "background_function_errors" {
  for_each = local.background_function_alarms

  alarm_name          = "${module.shared.name_prefix}-background-${each.key}-errors"
  alarm_description   = "The scheduled function ${each.value.function} keeps failing. ${each.value.stops} Read its logs: /aws/lambda/${each.value.function}. (Expected while the database is stopped.)"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = each.value.function }
  statistic           = "Sum"
  period              = each.value.period
  evaluation_periods  = each.value.periods
  datapoints_to_alarm = each.value.periods
  threshold           = each.value.threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = {
    Slice = "070-retire-core-api"
  }
}
