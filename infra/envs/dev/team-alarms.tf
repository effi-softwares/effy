# 119 Back-office team management (specs/119-backoffice-team-management).
#
# A team change writes the record first and the sign-in account second (research R5). When the second half fails the
# person is marked Needs attention on Settings › Team and access and stays that way until an administrator presses
# Repair. Access is never granted by a half-done change, but someone has to look: one failure is worth an email.
# Emitted by `@effy/edge-shared/team` (writer.ts recordSignInStep) from the admin-team stack.
resource "aws_cloudwatch_metric_alarm" "team_sign_in_step_failed" {
  alarm_name          = "${module.shared.name_prefix}-team-sign-in-step-failed"
  alarm_description   = "A back-office team change did not finish on the sign-in account. Open back-office › Settings › Team and access, filter Needs attention, and press Repair on the person."
  namespace           = "Effy/Team"
  metric_name         = "TeamSignInStepFailures"
  statistic           = "Sum"
  period              = 900
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = {
    Slice = "119-backoffice-team-management"
  }
}
