# 101 - the category-driven catalogue. Metrics are EMF from the services, in the default edge namespace
# (`Effy/Edge`, `metricNamespace()` in the shared metrics helper; neither `shop` nor `catalog` sets its own).
#
# An alarm addresses a metric by its exact dimensions, so this names the one the shop service emits;
# `catalogue-alarms.contract.test.ts` in the shop service fails it if nothing emits that name and dimension.

resource "aws_cloudwatch_metric_alarm" "catalogue_submit_missing_details" {
  alarm_name          = "${module.shared.name_prefix}-catalogue-submit-missing-details"
  alarm_description   = "101 - more than 20 product submissions in 15 minutes were refused because a required detail was empty. A category probably gained a requirement shops cannot answer, or a form changed under drafts. Check back-office > Categories & attributes (recent changes) and Product review > Missing details."
  namespace           = "Effy/Edge"
  metric_name         = "ProductSubmitRefused"
  dimensions          = { reason = "missing_required_details" }
  statistic           = "Sum"
  period              = 900
  evaluation_periods  = 1
  threshold           = 20
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  tags = {
    Slice = "101-category-driven-catalogue"
  }
}
