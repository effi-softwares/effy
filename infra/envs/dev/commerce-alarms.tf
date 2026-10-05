# Alarms on the shopper-facing money path (070-retire-core-api, FR-031/FR-033).
#
# ⚠ THESE REPLACE FOUR FILES THAT NEVER RAN. `infra/observability/alerts/*.yml` held Prometheus rules
# for delivery pricing, stock, refunds and delivery slots — written for a Prometheus + Grafana stack
# that was documented for months and never built. Nothing loaded them; every threshold in them was
# documentation. These are the same conditions on infrastructure that exists: CloudWatch metrics the
# services emit (embedded metric format) and the alerts topic that already reaches a person (037).
#
# ⚠ EVERY METRIC HERE IS IN ONE NAMESPACE, `Effy/Commerce`, whichever service emitted it. A refund
# issued from the back office (`orders`) or a shop console (`shop`) counts in the same series as one
# from a customer's cancellation — see MONEY_METRIC_NAMESPACE in the shared payments module. An
# alarm per service would watch one of three and let the other two fail silently.
#
# ⚠ AN ALARM ADDRESSES A METRIC BY ITS EXACT DIMENSIONS. A metric emitted with `outcome` and `type`
# is a different series for every pair, and an alarm cannot discover series — so each alarm below
# names the dimensions the code emits, and `alarms.contract.test.ts` in the commerce service fails
# the build if an alarm here watches a name or a dimension value nothing emits.
#
# ⚠ THRESHOLDS ARE STARTING VALUES for an environment with no traffic. `notBreaching` on missing
# data everywhere: a quiet platform emits nothing, and "no data" must not page.

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

# ⚠ ONE ALARM OVER TWO SERIES. A refund submission fails in two ways the code tells apart — the
# provider REFUSED it (a decision) or never ANSWERED (ambiguous; the reconciler takes it from there)
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
