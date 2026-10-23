# Product review. A product, and every change to one on sale, waits for a person at Effy; if nobody looks,
# nothing fails and the shop cannot sell. The metric is EMF from catalog's `reviewQueueAge` schedule (every
# 15 minutes).

variable "product_review_max_waiting_hours" {
  description = "067 — alarm when the oldest product or change waiting for Effy's review has waited longer than this many hours."
  type        = number
  default     = 24

  validation {
    condition     = var.product_review_max_waiting_hours > 0
    error_message = "product_review_max_waiting_hours must be greater than zero — a zero threshold alarms on every submission."
  }
}

# the age of the oldest item, not the size of the queue. Forty items decided within the hour is a
# healthy day; one item that has sat for two is a shop that cannot sell.
resource "aws_cloudwatch_metric_alarm" "product_review_stale" {
  alarm_name          = "${module.shared.name_prefix}-product-review-stale"
  alarm_description   = "067 — a product or product change has waited more than ${var.product_review_max_waiting_hours}h for Effy's review. The shop cannot sell it (or its change is not live) until someone decides it: back-office → Product review."
  namespace           = "Effy/Catalog"
  metric_name         = "ProductReviewOldestWaitingHours"
  statistic           = "Maximum"
  period              = 900
  evaluation_periods  = 1
  threshold           = var.product_review_max_waiting_hours
  comparison_operator = "GreaterThanThreshold"
  # missing data is breaching. An empty queue emits 0, so "no data" never means "nothing waiting"
  # it means the emitter has stopped, which is the alarm going blind. The opposite of the other
  # alarms in this root, on purpose.
  treat_missing_data = "breaching"
  alarm_actions      = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]
}
