# The sign-in code's issuance counter: the platform's only DynamoDB table, a recorded exception to
# "Database: PostgreSQL 16" (Postgres remains the database for all product data). Not Postgres because:
# 1. Sign-in must not depend on the database path (public in dev; edge-network.tf), or the eventual VPC
# move becomes a platform-wide sign-in outage.
# 2. Cognito abandons a trigger at 5 seconds (not configurable), and the pool's connect timeout alone is 5s.
# 3. Native TTL cleans up rows worthless within the hour.
#
# The code itself is never stored: it lives in the inbox and as a keyed hash in Cognito's challenge
# metadata. This holds a counter keyed on a hash of the address.

resource "aws_dynamodb_table" "otp_issuance" {
  name = "${module.shared.name_prefix}-otp-issuance"

  # On-demand: sign-in traffic is spiky and tiny, and a provisioned floor would cost more than the
  # requests. There is no capacity planning to get wrong.
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "pk"
  range_key = "windowStart"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "windowStart"
    type = "N"
  }

  # Deletion is not prompt (AWS gives no SLA — commonly minutes to 48h). The trigger therefore
  # always recomputes the window in code and never infers "no row means no sends". TTL here is
  # housekeeping, not a correctness mechanism.
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }

  # pitr deliberately off. Every row is an hourly counter over a hashed address that is worthless
  # within two hours; backing it up would buy nothing and would retain data we went out of our way
  # not to keep.
  point_in_time_recovery {
    enabled = false
  }

}

# The auth service reads these at deploy time (serverless.yml resolves ${ssm:...}).
resource "aws_ssm_parameter" "otp_table_name" {
  name  = "/effy/${var.env}/auth/otp/table_name"
  type  = "String"
  value = aws_dynamodb_table.otp_issuance.name
  tier  = "Standard"
}

resource "aws_ssm_parameter" "otp_table_arn" {
  name  = "/effy/${var.env}/auth/otp/table_arn"
  type  = "String"
  value = aws_dynamodb_table.otp_issuance.arn
  tier  = "Standard"
}

# ---------------------------------------------------------------------------------------------
# The HMAC key.
#
# It keys two things: the digest of the code (so a leak of Cognito's challenge metadata exposes a
# hash, not a secret) and the hash of the email address in the table key above (so the rate-limit
# store never holds a list of everyone who has tried to sign in).
#
# Rotating it invalidates every in-flight code. That is acceptable for a 5-minute secret — but do
# not rotate during a sign-in spike, and expect a handful of "that code isn't right" reports if you
# do it during business hours.
# ---------------------------------------------------------------------------------------------

#
# terraform creates the shell and never the value — on purpose.
#
# A `random_password` here would be convenient and would write the key into Terraform state in
# plaintext, where it would sit for the life of the environment and be readable by anyone who can
# read state. The platform already refuses that trade once: the RDS master password uses
# `manage_master_user_password` precisely so it never lands in state (infra/modules/rds-postgres).
# This follows that precedent rather than quietly making the opposite choice for a key that
# protects sign-in.
#
# The operator seeds it once, per environment:
#
# aws secretsmanager put-secret-value --profile ef --region ap-southeast-2 \
# --secret-id effy-dev-otp-hmac \
# --secret-string "{\"key\":\"$(openssl rand -hex 32)\"}"
#
# Until it is seeded the auth triggers fail closed: `hmacKey` throws, create-auth-challenge
# catches it, leaves no usable envelope, and the sign-in refuses. Nobody is signed in on a missing
# key — which is the right failure, but it IS a total sign-in outage, so seed it before attaching
# any pool.
resource "aws_secretsmanager_secret" "otp_hmac" {
  name        = "${module.shared.name_prefix}-otp-hmac"
  description = "035 — keys the sign-in code digest and the rate-limit address hash. Seeded by the operator, never by Terraform. Never leaves the auth service."

  # Dev convenience only: lets `make destroy ENV=dev` actually reclaim the name.
  recovery_window_in_days = 0

}

resource "aws_ssm_parameter" "otp_hmac_secret_arn" {
  name  = "/effy/${var.env}/auth/otp/hmac_secret_arn"
  type  = "String"
  value = aws_secretsmanager_secret.otp_hmac.arn
  tier  = "Standard"
}

# The SES identity ARN, so the auth service's ses:SendEmail grant can be scoped to it rather than
# to "*" (which is what edge-customer's existing grant does — deliberately not copied).
resource "aws_ssm_parameter" "ses_identity_arn" {
  name  = "/effy/${var.env}/ses/identity_arn"
  type  = "String"
  value = module.ses.identity_arn
  tier  = "Standard"
}

# Alarms on three of the triggers' EMF metrics. The third matters most: the issuance store fails open (a
# DynamoDB blip must not stop sign-in for four audiences), so an outage there silently disables the
# per-address rate limit, and this alarm is the only signal.

# A spike in failed verifications across many addresses is a distributed guessing campaign. Cognito
# no longer sees it — this is our metric now, and nothing else is watching.
# Wired these to a notification target. They shipped with 035 and had NO alarm_actions
# they turned red in a console nobody was watching. Under 035's own design a failed send IS a
# failed sign-in, so these are on the mail-and-sign-in path and inside 037 FR-037's scope.
resource "aws_cloudwatch_metric_alarm" "otp_verify_failures" {
  alarm_name          = "${module.shared.name_prefix}-otp-verify-failures"
  alarm_description   = "035 — elevated one-time-code verification failures. Expected baseline is typos; a sustained spike is a guessing campaign against a 6-digit space."
  namespace           = "Effy/Auth"
  metric_name         = "otp_verify_failed"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 50
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# The triggers fail closed. An error here is not a degraded experience — it is nobody being able
# to sign in on the attached pools, with no password fallback on three of the four audiences.
resource "aws_cloudwatch_metric_alarm" "otp_send_failures" {
  alarm_name          = "${module.shared.name_prefix}-otp-send-failures"
  alarm_description   = "035 — the sign-in code could not be sent. Under this design a failed send IS a failed sign-in."
  namespace           = "Effy/Auth"
  metric_name         = "otp_send_failed"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# See the header. Any value above zero means the per-address limit is not being enforced.
resource "aws_cloudwatch_metric_alarm" "otp_ratelimit_store_unavailable" {
  alarm_name          = "${module.shared.name_prefix}-otp-ratelimit-store-unavailable"
  alarm_description   = "035 — the issuance counter is unreachable and the per-address rate limit is FAILING OPEN. Sign-in still works; abuse protection does not."
  namespace           = "Effy/Auth"
  metric_name         = "otp_ratelimit_store_unavailable"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# A pool this code was never reviewed against is wired to these triggers. Should be impossible.
resource "aws_cloudwatch_metric_alarm" "otp_unknown_pool" {
  alarm_name          = "${module.shared.name_prefix}-otp-unknown-pool"
  alarm_description   = "035 — a user pool not in the audience map invoked the auth triggers. Sign-in is refused there; something was wired without review."
  namespace           = "Effy/Auth"
  metric_name         = "otp_unknown_pool"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# The CustomMessage interceptor could not brand a message, so Cognito sent its default. The person still
# gets a working message, so nothing else signals it. Fires only on a real branding failure (a render error
# or placeholder mismatch), never on an unmapped trigger's pass-through.
resource "aws_cloudwatch_metric_alarm" "custom_message_fallback" {
  alarm_name          = "${module.shared.name_prefix}-custom-message-fallback"
  alarm_description   = "038 — a Cognito sign-up/reset/verify/MFA message could not be branded and fell back to Cognito's default. The message still arrived; the platform design silently did not."
  namespace           = "Effy/Auth"
  metric_name         = "custom_message_fallback"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
