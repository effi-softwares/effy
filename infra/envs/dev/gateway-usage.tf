# How full each API gateway is, alarmed long before it matters. An HTTP API holds at most 300 routes and 300
# integrations (the integration limit is not raised), the provider publishes no metric for either, and the
# first sign of a full gateway is a deployment refused half-way.
#
# The admin service's hourly `gatewayUsage` function emits `GatewayUsagePercent` in `Effy/Platform` by
# gateway and limit; each alarm watches the higher of a gateway's two readings. Two levels
# (docs/api/path-assignment.md):
# 75% — plan. There is room for roughly a feature or two. Decide what moves, before it is urgent.
# 90% — stop adding routes to this gateway until something has moved.
#
# Missing data is not breaching (the check stopping has its own alarm in background-functions.tf). No
# `ok_actions`.

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
