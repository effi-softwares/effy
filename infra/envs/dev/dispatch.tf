# Driver work assignment: alarms on the planner (a scheduled function in the fleet stack, every five
# minutes), which emits EMF, to the alerts topic.

# The silent failure: a round has opened and nobody has the package. Nothing errors; the package does not
# move. The planner assigns on every pass all day, so work unassigned overnight is ordinary; it counts the
# real failure directly: unassigned work whose round would already be open. Three consecutive passes, so a
# gap between shifts does not page. `DispatchPackagesUnassigned` is still emitted as a gauge, with no alarm.
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

# Goods left in a parked van overnight. `releaseIneligibleWork` never reclaims picked-up work (it really is
# in a van), so custody can stay open with an order attached; the duty-end check makes a driver confirm what
# they hold, and this alarm is the backstop when they confirm anyway or stop using the app: custody open
# long after any round could be running. `notBreaching`: no data means nobody holds anything.
resource "aws_cloudwatch_metric_alarm" "driver_packages_held_overnight" {
  alarm_name        = "${module.shared.name_prefix}-driver-packages-held-overnight"
  alarm_description = "064 — packages have been in a driver's custody for longer than any round should last. They are physically in a van that is probably parked. GET /fleet/v1/custody names the driver and every package; the dispatcher must decide whether they come back to the hub or go out again."

  namespace   = "Effy/Dispatch"
  metric_name = "DriverPackagesHeldHours"
  statistic   = "Maximum"

  # Custody begins when a package is collected, not when its round is assigned — so 072 assigning
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
