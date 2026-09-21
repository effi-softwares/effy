# ---------------------------------------------------------------------------------------------
# Driver work assignment — 063-driver-work-assignment (Principle VII).
#
# Two alarms on the wave planner, routed to the existing alerts SNS topic (alerts.tf). The planner
# emits its metrics as CloudWatch EMF on stdout (the 035/050/058 pattern — no SDK call, no
# metric-filter/log-group ordering dependency), so these are plain alarms on emitted metrics.
#
# ⚠ NO NEW INFRASTRUCTURE OTHERWISE. This feature adds no service, no queue and no vendor: the
# planner is a scheduled function inside the existing edge-fleet stack, and the work model is
# ordinary PostgreSQL tables. The whole slice costs one more Lambda invocation every five minutes.
# ---------------------------------------------------------------------------------------------

# ⚠ THE SILENT FAILURE THIS WHOLE FEATURE CAN HAVE. A wave that considered forty packages and placed
# none of them looks exactly like a quiet afternoon from every other angle: no shopper sees an error,
# no driver is told anything is wrong, no request 500s. The packages simply do not move, and the
# first person to notice is a shop wondering where the van is.
#
# ⚠ Threshold zero, deliberately — the same reasoning 058 used for reconciliation corrections. There
# is no healthy baseline for "the engine placed nothing it was given"; one occurrence is the event.
resource "aws_cloudwatch_metric_alarm" "dispatch_wave_assigned_nothing" {
  alarm_name          = "${module.shared.name_prefix}-dispatch-wave-assigned-nothing"
  alarm_description   = "063 — a planning pass considered packages and assigned NONE of them. Nobody is being told: no driver has work and no shopper sees an error. Open the dispatch console's Needs-attention section — every package will carry the reason it could not be placed."
  namespace           = "Effy/Dispatch"
  metric_name         = "DispatchWaveAssignedNothing"
  statistic           = "Sum"
  period              = 900
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# ⚠ A STANDING BACKLOG, NOT A MOMENTARY ONE. Some unassigned work is ordinary — a package that became
# ready thirty seconds ago has not been placed yet, and a zone nobody covers is a staffing decision
# the console already reports. What is NOT ordinary is the same work going unplaced pass after pass,
# because that means the exception nobody is managing has become the norm (D15).
#
# Sustained over an hour rather than instantaneous, so a single busy wave does not page anybody.
resource "aws_cloudwatch_metric_alarm" "dispatch_persistent_unassigned" {
  alarm_name          = "${module.shared.name_prefix}-dispatch-persistent-unassigned"
  alarm_description   = "063 — packages have gone unassigned across several consecutive planning passes. Something structural is blocking them: nobody cleared for a zone, no vehicle held, or licences lapsed. The dispatch console names the reason per package."
  namespace           = "Effy/Dispatch"
  metric_name         = "DispatchPackagesUnassigned"
  statistic           = "Sum"
  period              = 900
  evaluation_periods  = 4
  datapoints_to_alarm = 4
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
