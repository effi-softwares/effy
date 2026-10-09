# ---------------------------------------------------------------------------------------------
# Courier parcels — 080-courier-fulfilment (Principle VII).
#
# ⚠ THE BLIND SPOT COURIER DELIVERY ADDS. A parcel that misses its courier's pickup — at the hub,
# or at a supplier the courier never reached — fails nothing: no error, no red test, no log line.
# The Courier tab in back-office shows it to whoever looks; these alarms are for when nobody does.
#
# The metric is emitted as CloudWatch EMF by edge-orders' `courierLateSweep` (every 30 minutes),
# one count per place, zero included — the 067 review-queue pattern.
# ---------------------------------------------------------------------------------------------

locals {
  # where → what the operator reads in the alarm.
  courier_late_alarms = {
    hub      = "080 — a courier parcel at the hub has missed its courier service's pickup for 2 hours. Back-office → Orders → Courier → Late at the hub."
    supplier = "080 — a courier pickup from a supplier has gone past its booked window for 2 hours with no handover. Back-office → Orders → Courier → Supplier pickups; switch the order to via the hub if the courier cannot come."
  }
}

# ⚠ LATE FOR TWO HOURS, NOT ONE SWEEP. A parcel handed over minutes after its cutoff is a normal
# day; four consecutive half-hourly counts of at least one is a parcel nobody has noticed.
resource "aws_cloudwatch_metric_alarm" "courier_parcels_late" {
  for_each = local.courier_late_alarms

  alarm_name          = "${module.shared.name_prefix}-courier-parcels-late-${each.key}"
  alarm_description   = each.value
  namespace           = "Effy/Orders"
  metric_name         = "CourierParcelsLate"
  dimensions          = { where = each.key }
  statistic           = "Minimum"
  period              = 1800
  evaluation_periods  = 4
  datapoints_to_alarm = 4
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  # ⚠ MISSING DATA IS BREACHING: the sweep emits 0 when nothing is late, so "no data" means it has
  # stopped — the alarm going blind.
  treat_missing_data = "breaching"
  alarm_actions      = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]
}

# ---------------------------------------------------------------------------------------------
# Orders moved to courier by back-office — 081-courier-override-compensation (Principle VII).
#
# ⚠ AN EMERGENCY TOOL USED AS A ROUTINE ONE IS THE SIGNAL. Moving a paid Effy order to courier
# breaks a promise to a customer and costs Effy the compensation. A few a day is a bad day; more
# than that means the operation has a problem nobody has named — or the tool is being used for
# something it is not for. The metric is EMF from edge-orders' delivery-move route, one per move,
# by direction; only moves TO courier are counted here.
# ---------------------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "delivery_overrides_daily" {
  alarm_name          = "${module.shared.name_prefix}-delivery-overrides-daily"
  alarm_description   = "081 — more than ${var.delivery_override_daily_alarm} orders were moved from Effy delivery to courier in a day. Moves are meant to be rare emergencies. Back-office → Orders: each moved order lists who moved it and why."
  namespace           = "Effy/Orders"
  metric_name         = "DeliveryOverrides"
  dimensions          = { to = "courier" }
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = var.delivery_override_daily_alarm
  comparison_operator = "GreaterThanThreshold"
  # No moves is no data, and no moves is the good day.
  treat_missing_data = "notBreaching"
  alarm_actions      = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]
}
