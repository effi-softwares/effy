# ══ 102 - product imports: a shop's list, checked and created by a worker ══════════════════════════
#
# Spec specs/102-backoffice-product-catalogue (research R5). The catalog service writes an import and
# sends one message per step (check, then create); the route-less worker in the same service does the
# step. Pictures it fetches wait under imports/ in the media bucket - private, never notified, never in
# local.public_media_prefixes - and expire after a week (media.tf).

# sse-SQS below; a CMK adds cost and IAM surface with no requirement behind it
# trivy:ignore:avd-aws-0096
resource "aws_sqs_queue" "product_import_dlq" {
  name                      = "${module.shared.name_prefix}-product-import-dlq"
  message_retention_seconds = 1209600 # 14 days to look at what failed
  sqs_managed_sse_enabled   = true
}

# as above
# trivy:ignore:avd-aws-0096
resource "aws_sqs_queue" "product_import" {
  name                       = "${module.shared.name_prefix}-product-import"
  visibility_timeout_seconds = 5400 # six times the worker's 900 s timeout
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.product_import_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_ssm_parameter" "product_import_queue_arn" {
  name  = "/effy/${var.env}/catalog/product_import_queue_arn"
  type  = "String"
  value = aws_sqs_queue.product_import.arn
  tier  = "Standard"
}

resource "aws_ssm_parameter" "product_import_queue_url" {
  name  = "/effy/${var.env}/catalog/product_import_queue_url"
  type  = "String"
  value = aws_sqs_queue.product_import.id
  tier  = "Standard"
}

resource "aws_cloudwatch_metric_alarm" "product_import_dlq" {
  alarm_name          = "${module.shared.name_prefix}-product-import-dlq"
  alarm_description   = "102 - a product import step failed three times (the database or S3 failing, not a bad row). The import stays 'checking' or 'creating' in back-office. Read /aws/lambda/effy-edge-catalog-${var.env}-productImportWorker, fix the cause, then redrive ${aws_sqs_queue.product_import_dlq.name}; the worker skips rows already done."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.product_import_dlq.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "product_import_errors" {
  alarm_name          = "${module.shared.name_prefix}-product-import-errors"
  alarm_description   = "102 - the product import worker keeps failing: imports are not being checked or created. Read /aws/lambda/effy-edge-catalog-${var.env}-productImportWorker. (Expected while the database is stopped.)"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = "effy-edge-catalog-${var.env}-productImportWorker" }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 2
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
