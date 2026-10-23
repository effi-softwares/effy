# Alarms on the shopper-facing money path, on the CloudWatch metrics the services emit (EMF).
#
# Every metric is in one namespace, `Effy/Commerce`, whichever service emitted it (MONEY_METRIC_NAMESPACE in
# the shared payments module): a refund from `orders`, `shop` or a customer's cancellation is one series.
#
# An alarm addresses a metric by its exact dimensions and cannot discover series, so each names the
# dimensions the code emits; `alarms.contract.test.ts` in the commerce service fails an alarm watching a
# name or dimension value nothing emits. Thresholds are starting values; `notBreaching` everywhere (a quiet
# platform emits nothing).

locals {
  commerce_metric_namespace = "Effy/Commerce"

  # name = { metric, dimensions, statistic, period, threshold (>=), description }
  commerce_alarms = {
    delivery-quote-failures = {
      metric      = "DeliveryQuoteFailures"
      dimensions  = {}
      statistic   = "Sum"
      period      = 900
      threshold   = 5
      description = "070 — a delivery quote could not be priced for an address Effy serves (no active fee plan, or a zone with no price). Shoppers at those addresses cannot check out. Check the active delivery plan in back-office."
    }
    no-delivery-windows-defined = {
      metric      = "EffyWindowsNoneDefined"
      dimensions  = {}
      statistic   = "Sum"
      period      = 900
      threshold   = 1
      description = "078 - a customer at an address Effy delivers to was offered NO delivery window because none is switched on. Nobody in Effy's area can check out. Add or switch on a window in back-office > Delivery > Windows. (Only possible once the new delivery model is on.)"
    }
    stock-blocked-at-checkout = {
      metric      = "StockBlocked"
      dimensions  = { stage = "checkout" }
      statistic   = "Sum"
      period      = 900
      threshold   = 5
      description = "070 — checkouts are being trimmed because the cart asked for more than the shop has. Stock counts are behind what is being sold: look at the products running out in the shop consoles."
    }
    refund-failed-at-provider = {
      metric      = "RefundOutcomes"
      dimensions  = { outcome = "failed" }
      statistic   = "Sum"
      period      = 300
      threshold   = 1
      description = "070 — the bank REJECTED a refund the platform had told a customer was on its way. It will not retry itself. Open the order in back-office: the refund shows as failed and needs a person."
    }
    slot-over-capacity = {
      metric      = "SlotBookings"
      dimensions  = { outcome = "over_capacity" }
      statistic   = "Sum"
      period      = 300
      threshold   = 1
      description = "070 — a customer paid for a same-day window after their hold lapsed and the window had filled. The order is honoured and the window is now over its capacity: dispatch needs to know before the wave is planned."
    }
    refund-stuck = {
      metric      = "RefundsStuck"
      dimensions  = {}
      statistic   = "Maximum"
      period      = 300
      threshold   = 1
      description = "070 — a refund has been waiting more than 15 minutes for the payment provider to answer and the reconciler has not been able to resolve it. A customer may be owed money nobody is sending. Check the provider's status and the refundReconcile function's logs."
    }
    points-hold-shortfall = {
      metric      = "PointsHoldShortfall"
      dimensions  = {}
      statistic   = "Sum"
      period      = 300
      threshold   = 1
      description = "074 - a customer paid after their points hold lapsed and the points had since been spent or removed. The order is honoured, the customer is not charged again, and Effy has absorbed the difference (order.points_shortfall_amount). Check whether the hold period is too short or a debit raced a checkout."
    }
    points-ledger = {
      metric      = "PointsInvariantViolations"
      dimensions  = {}
      statistic   = "Maximum"
      period      = 3600
      threshold   = 1
      description = "074 - the points ledger does not add up: a lot allocated beyond its points, a debit whose allocations do not match it, a negative balance, or a hold left on an order that is no longer pending. Something wrote points outside the shared module, or it has a bug. Check the pointsReconcile function's logs for which."
    }
    tax-invoice-while-disabled = {
      metric      = "TaxInvoiceRequestedWhileDisabled"
      dimensions  = {}
      statistic   = "Sum"
      period      = 3600
      threshold   = 1
      description = "096 - a customer asked for a tax invoice and was told it is not available yet, because Effy's tax details are not set. Set the legal name, ABN and fee treatment in back-office > Settings > Tax, classify every product's GST status, then turn invoices on. (FR-084: nothing is issued until then; a placeholder is never printed.)"
    }
    unclassified-product-refused = {
      metric      = "UnclassifiedProductRefused"
      dimensions  = {}
      statistic   = "Sum"
      period      = 900
      threshold   = 1
      description = "096 - a checkout was refused because a product in the cart has no GST status while tax invoices are on. The customer was told only that it is unavailable. Set its status in back-office > Product review > GST missing."
    }
    webhook-failing = {
      metric      = "WebhookFailures"
      dimensions  = {}
      statistic   = "Sum"
      period      = 900
      threshold   = 3
      description = "070 — payment-provider notifications are failing to process (nothing is recorded, so the provider will retry). Paid orders still land when the shopper returns to the site, but refunds rejected by a bank would go unseen. Check the stripeWebhookV1 function's logs. Above one on purpose: a single failure the provider's retry recovers must not page."
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "commerce" {
  for_each = local.commerce_alarms

  alarm_name          = "${module.shared.name_prefix}-commerce-${each.key}"
  alarm_description   = each.value.description
  namespace           = local.commerce_metric_namespace
  metric_name         = each.value.metric
  dimensions          = each.value.dimensions
  statistic           = each.value.statistic
  period              = each.value.period
  evaluation_periods  = 1
  threshold           = each.value.threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  tags = {
    Slice = "070-retire-core-api"
  }
}

# one alarm over two series. A refund submission fails in two ways the code tells apart — the
# provider refused it (a decision) or never answered (ambiguous; the reconciler takes it from there)
# — and each is its own series. Either one is a customer who was told money is coming, so the alarm
# is on their sum.
resource "aws_cloudwatch_metric_alarm" "commerce_refund_submit_failures" {
  alarm_name          = "${module.shared.name_prefix}-commerce-refund-submit-failures"
  alarm_description   = "070 — a refund could not be submitted to the payment provider: it was refused outright, or the provider did not answer (those are retried automatically and raise the refund-stuck alarm if they stay unresolved). Open the order in back-office."
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  metric_query {
    id          = "failures"
    expression  = "FILL(refused, 0) + FILL(ambiguous, 0)"
    label       = "Refund submissions that failed"
    return_data = true
  }

  metric_query {
    id = "refused"
    metric {
      namespace   = local.commerce_metric_namespace
      metric_name = "RefundSubmitFailures"
      dimensions  = { failure = "refused" }
      stat        = "Sum"
      period      = 300
    }
  }

  metric_query {
    id = "ambiguous"
    metric {
      namespace   = local.commerce_metric_namespace
      metric_name = "RefundSubmitFailures"
      dimensions  = { failure = "ambiguous" }
      stat        = "Sum"
      period      = 300
    }
  }

  tags = {
    Slice = "070-retire-core-api"
  }
}
