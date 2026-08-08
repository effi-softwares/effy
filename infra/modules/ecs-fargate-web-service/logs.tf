# CloudWatch log group for the task's stdout/stderr. Short retention = cheap; the structured
# logs land here and (per platform observability) flow onward to Grafana.
resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.name_prefix}-core-api"
  retention_in_days = var.log_retention
}
