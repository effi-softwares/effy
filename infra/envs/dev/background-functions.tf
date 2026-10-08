# Alarms on the functions NO REQUEST REACHES — the ones run by a schedule.
#
# ⚠ WHY THESE EXIST. The gateway's 5xx alarm (edge-gateway.tf) sees a server error on any route. It
# cannot see a function nothing calls. Each function below is already watched by what it is FOR — a
# refund left stuck, a notification that failed to send, a wave that placed nothing — but every one
# of those signals is EMITTED BY THE FUNCTION. If the function throws before it gets that far (a bad
# deploy, a missing permission, a renamed column) it emits nothing, "no data" is treated as healthy,
# and the work simply stops with every alarm green.
#
# So each gets the one alarm that does not depend on its own code running: the platform's count of
# invocations that ended in an error.
#
# ⚠ A FAILURE MUST PERSIST TO PAGE. One failed run is usually a cold database connection, and the
# next run a minute later succeeds. Each alarm needs the failure to repeat across its whole window.
#
# ⚠ NO `ok_actions`, deliberately. These fire together when the database is stopped (stop-db.sh —
# every scheduled function fails until it is started again). That is seven emails as it is; the
# recoveries would make it fourteen, and "it is working again" is not news an operator who has just
# started the database needs to be told.
#
# ⚠ THE FUNCTION NAMES ARE A CONTRACT with each service's serverless.yml:
# `<service>-<stage>-<function key>`. Renaming a function there disarms its alarm here with nothing
# failing — the alarm just watches a name that no longer exists. Rename both together.
#
# Not listed, because each already has its own wired error alarm: `insightsRollup` (insights.tf),
# and admin's `sesEventConsumer` / `sesIdentityHealth` (that service's serverless.yml). The Cognito
# trigger functions are not scheduled: a failure there fails a sign-in the person sees at once.

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
