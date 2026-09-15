# ---------------------------------------------------------------------------------------------
# Shop Insights — 058-shop-today-insights (Principle VII).
#
# Three alarms, all routed to the existing alerts SNS topic (alerts.tf). The rollup job emits its
# metrics as CloudWatch EMF on stdout (the 035/050 pattern — no SDK call, no metric-filter/log-group
# ordering dependency), so these are plain alarms on emitted metrics.
#
# ⚠ NO NEW INFRASTRUCTURE OTHERWISE. This feature adds no queue, no cache, no realtime service and no
# vendor: the analytics are Postgres rollup tables, the live stream is an HTTP response from the
# Fargate task that already exists, and the notification channel is PostgreSQL's own LISTEN/NOTIFY.
# docs/insights-architecture.md prices the alternatives — $25–$110/month at 500k orders, against
# roughly $13 for this shape.
# ---------------------------------------------------------------------------------------------

# ⚠ THE AGE OF THE BACKLOG, NOT ITS SIZE. A queue of 400 buckets drained every minute is healthy; one
# bucket that has sat for twenty minutes means an operator is reading twenty-minute-old figures and
# nothing is fixing it. SC-004 promises the figures are never more than five minutes behind, so the
# alarm fires at four — before the promise is broken, not after.
resource "aws_cloudwatch_metric_alarm" "insights_backlog_stale" {
  alarm_name          = "${module.shared.name_prefix}-insights-backlog-stale"
  alarm_description   = "058 — insight rollups are falling behind. The Insights screen is showing stale figures. Check the insightsRollup Lambda's logs and the database's load."
  namespace           = "Effy/Insights"
  metric_name         = "InsightsBacklogAgeMs"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 240000 # 4 minutes
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# ⚠ THRESHOLD ZERO, AND THAT IS DELIBERATE. Every other alarm on this platform tolerates a baseline.
# A reconciliation correction means a figure changed WITHOUT its bucket being marked dirty — so a
# writer is reaching these tables in a way the triggers do not see. The nightly repair is cheap; the
# hole it implies is what needs a person, and it will not announce itself any other way.
resource "aws_cloudwatch_metric_alarm" "insights_reconcile_corrections" {
  alarm_name          = "${module.shared.name_prefix}-insights-reconcile-corrections"
  alarm_description   = "058 — the nightly sweep had to correct insight figures, so something changed them without marking the bucket dirty. Find the writer; do not rely on the nightly repair."
  namespace           = "Effy/Insights"
  metric_name         = "InsightsReconcileCorrections"
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# The rollup Lambda failing outright. The dirty table is the queue, so a failed run loses nothing —
# but a run that fails every minute means the figures stop moving, silently.
resource "aws_cloudwatch_metric_alarm" "insights_rollup_errors" {
  alarm_name          = "${module.shared.name_prefix}-insights-rollup-errors"
  alarm_description   = "058 — the insights rollup Lambda is erroring. Figures stop advancing while this persists; the queue itself is safe."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 3
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = "effy-edge-shop-${var.env}-insightsRollup"
  }
}
