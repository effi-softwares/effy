# How full each API gateway is — alarmed long before it matters (075 FR-017).
#
# ⚠ THE FAILURE THIS PREVENTS HAS ALREADY HAPPENED ONCE. An HTTP API holds at most 300 routes and 300
# integrations; the integration limit is one the provider does not raise. On 2026-10-08 the shared
# gateway reached both, and the first sign was a deployment refused half-way. The provider publishes
# no metric for either count, so nothing had been watching.
#
# The number comes from the `gatewayUsage` function in the admin service, hourly: four series of
# `GatewayUsagePercent` in `Effy/Platform`, by gateway and by limit. Each alarm below watches the
# HIGHER of a gateway's two readings — they are equal while every function has one route, and it is
# whichever is higher that refuses the deployment.
#
# ⚠ TWO LEVELS, AND THEY MEAN DIFFERENT THINGS (docs/api/path-assignment.md, "When a gateway nears
# its ceiling"):
#   75% — plan. There is room for roughly a feature or two. Decide what moves, before it is urgent.
#   90% — stop adding routes to this gateway until something has moved.
#
# ⚠ Missing data is NOT breaching: an hour without a reading is not a full gateway. The check
# stopping is a different fault with its own alarm — the function's failed-invocation alarm in
# background-functions.tf — so silence here never has to mean two things.
#
# ⚠ No `ok_actions`: a gateway dropping back under a line is the result of work someone just did.

locals {
  gateway_usage_levels = {
    warning  = { threshold = 75, means = "Plan now: decide what will move off it or onto another gateway before it is urgent." }
    critical = { threshold = 90, means = "Stop adding routes to it until something has moved - the next feature may be refused at deployment." }
  }

  gateway_usage_alarms = {
    for pair in setproduct(["shared", "staff"], keys(local.gateway_usage_levels)) :
    "${pair[0]}-${pair[1]}" => { gateway = pair[0], level = pair[1] }
  }
}

resource "aws_cloudwatch_metric_alarm" "gateway_usage" {
  for_each = local.gateway_usage_alarms

  alarm_name          = "${module.shared.name_prefix}-gateway-usage-${each.key}"
  alarm_description   = "The ${each.value.gateway} API gateway is at or above ${local.gateway_usage_levels[each.value.level].threshold}% of its limit of 300 routes or 300 integrations (the integration limit cannot be raised). ${local.gateway_usage_levels[each.value.level].means} See the numbers: make gateway-usage ENV=${var.env}. What to do: docs/api/path-assignment.md."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = local.gateway_usage_levels[each.value.level].threshold
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  metric_query {
    id          = "fullest"
    expression  = "MAX([routes, integrations])"
    label       = "Fullest limit (%)"
    return_data = true
  }

  dynamic "metric_query" {
    for_each = toset(["routes", "integrations"])

    content {
      id = metric_query.value

      metric {
        namespace   = "Effy/Platform"
        metric_name = "GatewayUsagePercent"
        dimensions  = { gateway = each.value.gateway, limit = metric_query.value }
        stat        = "Maximum"
        period      = 3600
      }
    }
  }

  tags = {
    Slice = "075-staff-gateway"
  }
}
