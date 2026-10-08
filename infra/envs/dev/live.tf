# The live-update channel (071-live-updates).
#
# One managed publish/subscribe API (AWS AppSync Events). The backend function that commits a change
# publishes "something of this KIND changed" to the channel of whoever it concerns; each open app
# re-reads through the routes it already uses. No connection is held by anything the platform runs,
# and nothing here costs anything while no app is connected and nothing is changing (constitution
# v3.1.0, Principle III).
#
# ⚠ DEPLOY ORDER. The API names the authorizer function, so that function must exist first:
#     1. make edge-deploy SERVICE=live ENV=<env>     (the authorizer)
#     2. make apply ENV=<env>                        (this file)
#     3. make edge-deploy for each service that announces — they read the parameters below.
#
# ⚠ THREE AUTH MODES, ONE PER DIRECTION, AND NO COGNITO PROVIDER.
#   connect + subscribe → the Lambda authorizer. Whether a person may hear a shop is a platform
#     record, not a token claim; a Cognito provider could only prove which pool issued the token.
#   publish → IAM. Only a backend role holding the policy below can publish; the authorizer refuses
#     every publish that reaches it, so a client cannot publish by either route.
#
# ⚠ THE AUTHORIZER'S CACHE IS SET BY THE FUNCTION (ttlOverride), not here. The value here is the
# fallback for an answer that carries none, and it is 0 on purpose: an answer the function did not
# deliberately mark as reusable is not reused.

locals {
  live_authorizer_function = "effy-edge-live-${var.env}-authorizer"

  # Whose updates travel where. The names are a contract with apis/edge-api/shared/src/live/channel.ts
  # (LIVE_NAMESPACES); `live.contract.test.ts` fails the build if the two lists differ.
  live_namespaces = ["shop", "customer", "driver", "ops"]

  # Every kind an update may name — a contract with packages/shared-types/src/live.ts (LIVE_KINDS).
  # The failure alarm must name each one: a CloudWatch alarm addresses a metric by its exact
  # dimensions and cannot discover series, so a kind missing here fails silently.
  live_kinds = ["orders", "stock", "attention", "work", "dispatch", "slots", "review", "points", "coverage", "pricing"]

  live_metric_namespace = "Effy/Live"
}

data "aws_lambda_function" "live_authorizer" {
  function_name = local.live_authorizer_function
}

resource "aws_appsync_api" "live" {
  name = "${module.shared.name_prefix}-live"

  event_config {
    auth_provider {
      auth_type = "AWS_LAMBDA"

      lambda_authorizer_config {
        authorizer_uri                   = data.aws_lambda_function.live_authorizer.arn
        authorizer_result_ttl_in_seconds = 0
      }
    }

    auth_provider {
      auth_type = "AWS_IAM"
    }

    connection_auth_mode {
      auth_type = "AWS_LAMBDA"
    }

    default_subscribe_auth_mode {
      auth_type = "AWS_LAMBDA"
    }

    default_publish_auth_mode {
      auth_type = "AWS_IAM"
    }
  }

  tags = {
    Slice = "071-live-updates"
  }
}

# No handler code: the default forwards what is published, and what is published is one word. All
# authorization is in the authorizer — a second place to decide who may listen would be a second
# place for the decision to be wrong.
resource "aws_appsync_channel_namespace" "live" {
  for_each = toset(local.live_namespaces)

  api_id = aws_appsync_api.live.api_id
  name   = each.key

  subscribe_auth_mode {
    auth_type = "AWS_LAMBDA"
  }

  publish_auth_mode {
    auth_type = "AWS_IAM"
  }

  tags = {
    Slice = "071-live-updates"
  }
}

# Only this API may invoke the authorizer.
resource "aws_lambda_permission" "live_authorizer" {
  statement_id  = "AllowLiveChannelInvoke"
  action        = "lambda:InvokeFunction"
  function_name = data.aws_lambda_function.live_authorizer.function_name
  principal     = "appsync.amazonaws.com"
  source_arn    = aws_appsync_api.live.api_arn
}

# App↔infra contract: /effy/<env>/live/{http_host, realtime_host, api_arn}.
#   http_host      — where the backend publishes, and the host an app names in its handshake.
#   realtime_host  — where an app's socket connects.
#   api_arn        — scopes each announcing service's publish permission to this API.
# No secret: publishing is by role, subscribing by the person's own token.
resource "aws_ssm_parameter" "live_http_host" {
  name  = "/effy/${var.env}/live/http_host"
  type  = "String"
  value = aws_appsync_api.live.dns["HTTP"]
  tier  = "Standard"
}

resource "aws_ssm_parameter" "live_realtime_host" {
  name  = "/effy/${var.env}/live/realtime_host"
  type  = "String"
  value = aws_appsync_api.live.dns["REALTIME"]
  tier  = "Standard"
}

resource "aws_ssm_parameter" "live_api_arn" {
  name  = "/effy/${var.env}/live/api_arn"
  type  = "String"
  value = aws_appsync_api.live.api_arn
  tier  = "Standard"
}

# --- Alarms (FR-033) ------------------------------------------------------------------------------

# ⚠ ONE ALARM OVER SEVEN SERIES. `UpdateSendFailures` is emitted with the kind as its dimension, so
# each kind is its own series; the alarm is on their sum. A failed update never fails the change it
# follows (FR-006) — which is exactly why it needs an alarm: nothing else will ever report it.
resource "aws_cloudwatch_metric_alarm" "live_update_send_failures" {
  alarm_name          = "${module.shared.name_prefix}-live-update-send-failures"
  alarm_description   = "071 — the backend could not tell open apps that something changed. The changes themselves succeeded; screens are stale until their next update or until the person returns to the app. Check the live API (AppSync Events) and the publishing functions' logs for 'live: update not sent'."
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  metric_query {
    id          = "failures"
    expression  = join(" + ", [for k in local.live_kinds : "FILL(${k}, 0)"])
    label       = "Live updates that could not be sent"
    return_data = true
  }

  dynamic "metric_query" {
    for_each = toset(local.live_kinds)

    content {
      id = metric_query.value

      metric {
        namespace   = local.live_metric_namespace
        metric_name = "UpdateSendFailures"
        dimensions  = { kind = metric_query.value }
        stat        = "Sum"
        period      = 900
      }
    }
  }

  tags = {
    Slice = "071-live-updates"
  }
}

# The authorizer refusing someone is not an error; the function THROWING is. While it throws, nobody
# can subscribe and every screen says live updates are off.
resource "aws_cloudwatch_metric_alarm" "live_authorizer_errors" {
  alarm_name          = "${module.shared.name_prefix}-live-authorizer-errors"
  alarm_description   = "071 — the live channel's authorizer is failing, so no app can connect or subscribe and every screen shows 'live updates off'. Nothing else is affected: screens still read on open and on refresh. Read /aws/lambda/${local.live_authorizer_function}. (Expected while the database is stopped — it reads staff and driver records.)"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = local.live_authorizer_function }
  statistic           = "Sum"
  period              = 900
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = {
    Slice = "071-live-updates"
  }
}

# --- Cost (SC-006, FR-033) ------------------------------------------------------------------------

# The feature's bound is 5 USD a month; this warns at 4. The bill is linear in orders (research
# R12), so this is what tells the operator the platform has outgrown the estimate before the bound
# is passed.
#
# ⚠ NOTIFIES THE EXISTING ALERTS TOPIC — no address is written here, and none may be (constitution,
# Real-World Identifiers). The topic's policy admits the budgets service (amplify-customer-web.tf).
#
# ⚠ A BUDGET IS ACCOUNT-WIDE, not per environment: it watches every AppSync charge in the account.
# With one environment that is the same thing. A second environment must not declare a second one.
resource "aws_budgets_budget" "live" {
  name         = "${module.shared.name_prefix}-live-updates"
  budget_type  = "COST"
  limit_amount = "4"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Service"
    values = ["AWS AppSync"]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }
}

output "live_http_host" {
  description = "Host the backend publishes live updates to, and an app names in its handshake."
  value       = aws_appsync_api.live.dns["HTTP"]
}

output "live_realtime_host" {
  description = "Host an app's live-update socket connects to."
  value       = aws_appsync_api.live.dns["REALTIME"]
}
