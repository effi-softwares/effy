# ---------------------------------------------------------------------------------------------
# Driver work assignment — 063-driver-work-assignment (Principle VII).
#
# Alarms on the planner, routed to the existing alerts SNS topic (alerts.tf). The planner
# emits its metrics as CloudWatch EMF on stdout (the 035/050/058 pattern — no SDK call, no
# metric-filter/log-group ordering dependency), so these are plain alarms on emitted metrics.
#
# ⚠ NO NEW INFRASTRUCTURE OTHERWISE. This feature adds no service, no queue and no vendor: the
# planner is a scheduled function inside the existing edge-fleet stack, and the work model is
# ordinary PostgreSQL tables. The whole slice costs one more Lambda invocation every five minutes.
# ---------------------------------------------------------------------------------------------

# ⚠ THE SILENT FAILURE THIS WHOLE FEATURE CAN HAVE: A ROUND HAS OPENED AND NOBODY HAS THE PACKAGE.
#
# No shopper sees an error, no driver is told anything is wrong, no request 500s. The package simply
# does not move, and the first person to notice is a shop wondering where the van is.
#
# ⚠ 072 REPLACED TWO ALARMS WITH THIS ONE, BECAUSE BOTH WOULD NOW FIRE EVERY NIGHT. Until 072 the
# planner ran only in the 45 minutes before a collection run, so "a pass considered packages and
# assigned none" (DispatchWaveAssignedNothing) and "packages unassigned for an hour"
# (DispatchPackagesUnassigned) were both real failures. The planner now assigns on every pass, all
# day: a package a shop finishes at 20:00, after the last driver has gone home, is unassigned on every
# pass until morning — and that is ordinary. The failure that remains real is narrower, and the
# planner counts it directly: unassigned work whose round would ALREADY BE OPEN.
#
# Three consecutive five-minute passes, so one pass that lands between a driver clocking off and
# another clocking on does not page anybody.
#
# ⚠ `DispatchPackagesUnassigned` is still emitted, as a per-pass gauge for anyone reading the graph.
# It carries no alarm, deliberately.
resource "aws_cloudwatch_metric_alarm" "dispatch_unassigned_past_opening" {
  alarm_name          = "${module.shared.name_prefix}-dispatch-unassigned-past-opening"
  alarm_description   = "072 — packages are still unassigned although the round they belong to has already opened: a collection run is under an hour away, or a delivery window is about to start, and no driver has the work. Open the dispatch console's Needs-attention section — every package carries the reason it could not be given to anybody."
  namespace           = "Effy/Dispatch"
  metric_name         = "DispatchUnassignedPastOpening"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# ── 064 — custody ───────────────────────────────────────────────────────────────────────────────

# ⚠ GOODS LEFT IN A PARKED VAN OVERNIGHT, WHICH NOTHING ELSE REPORTS.
#
# 056 found that standing a driver down could strand physical goods permanently and invisibly:
# `releaseIneligibleWork` correctly never reclaims picked-up work (the packages really are in a van),
# the UNIQUE index then keeps them claimed, and every sweep's `NOT EXISTS` skips them forever with a
# customer's order attached to each one. 064's duty-end check (FR-018) stops a shift ending SILENTLY
# that way — the driver is shown what they hold and must confirm.
#
# But a driver may confirm, or simply stop using the app. This alarm is the backstop for the state
# nobody chose: custody still open long after any round could reasonably be running.
#
# ⚠ `treat_missing_data = "notBreaching"` — no data means nobody is holding anything, which is the
# healthy state, not an unknown one.
resource "aws_cloudwatch_metric_alarm" "driver_packages_held_overnight" {
  alarm_name        = "${module.shared.name_prefix}-driver-packages-held-overnight"
  alarm_description = "064 — packages have been in a driver's custody for longer than any round should last. They are physically in a van that is probably parked. GET /fleet/v1/custody names the driver and every package; the dispatcher must decide whether they come back to the hub or go out again."

  namespace   = "Effy/Dispatch"
  metric_name = "DriverPackagesHeldHours"
  statistic   = "Maximum"

  # Custody begins when a package is COLLECTED, not when its round is assigned — so 072 assigning
  # rounds hours ahead changes nothing here. A collection run finishes at its run time and a same-day
  # round by end of day, so twelve hours of unbroken custody is not a long round — it is a van nobody
  # has emptied.
  threshold           = 12
  period              = 3600
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}
