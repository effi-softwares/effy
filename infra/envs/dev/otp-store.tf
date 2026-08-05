# ---------------------------------------------------------------------------------------------
# 035-six-digit-otp — the sign-in code's issuance counter.
#
# ⚠ THIS IS THE PLATFORM'S FIRST DYNAMODB TABLE, and it is a deliberate, recorded exception to the
# constitution's locked "Database: PostgreSQL 16" (specs/035-six-digit-otp/plan.md § Complexity
# Tracking). PostgreSQL is NOT displaced — it remains the database for every piece of product data.
#
# Why not Postgres for this one counter:
#
#   1. ⚠ The decisive reason is NOT latency. The edge Lambdas reach RDS today ONLY because the dev
#      database is on the public internet (`db_allowed_cidrs = ["0.0.0.0/0"]`,
#      `db_publicly_accessible = true`), which infra/envs/dev/edge-network.tf records as a posture
#      that is invalid for qa/staging/prod. Putting SIGN-IN on that connection would turn the
#      eventual VPC migration into a platform-wide sign-in outage.
#   2. Cognito abandons a trigger at 5 seconds and that cannot be configured. @effy/edge-shared's
#      pool already allows 5s just to ACQUIRE a connection, and a Sydney RDS round trip measures
#      135ms. 027 and 029 both shipped timeout defects of exactly this shape.
#   3. Native TTL means no cleanup job for rows that are worthless within the hour.
#
# ⚠ WHAT IS NOT IN HERE: the code. It is never persisted anywhere — it lives in the shopper's inbox
# and as a keyed hash inside Cognito's own challenge metadata. This table holds a COUNTER and
# nothing else, keyed on a HASH of the address. See specs/035-six-digit-otp/data-model.md.
# ---------------------------------------------------------------------------------------------

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

  # ⚠ Deletion is NOT prompt (AWS gives no SLA — commonly minutes to 48h). The trigger therefore
  # always recomputes the window in code and NEVER infers "no row means no sends". TTL here is
  # housekeeping, not a correctness mechanism.
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }

  # ⚠ PITR deliberately OFF. Every row is an hourly counter over a hashed address that is worthless
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
# ⚠ Rotating it invalidates every IN-FLIGHT code. That is acceptable for a 5-minute secret — but do
# not rotate during a sign-in spike, and expect a handful of "that code isn't right" reports if you
# do it during business hours.
# ---------------------------------------------------------------------------------------------

#
# ⚠ TERRAFORM CREATES THE SHELL AND NEVER THE VALUE — on purpose.
#
# A `random_password` here would be convenient and would write the key into Terraform state in
# plaintext, where it would sit for the life of the environment and be readable by anyone who can
# read state. The platform already refuses that trade once: the RDS master password uses
# `manage_master_user_password` precisely so it never lands in state (infra/modules/rds-postgres).
# This follows that precedent rather than quietly making the opposite choice for a key that
# protects sign-in.
#
# The operator seeds it once, per environment (quickstart §4):
#
#   aws secretsmanager put-secret-value --profile ef --region ap-southeast-2 \
#     --secret-id effy-dev-otp-hmac \
#     --secret-string "{\"key\":\"$(openssl rand -hex 32)\"}"
#
# ⚠ Until it is seeded the auth triggers FAIL CLOSED: `hmacKey()` throws, create-auth-challenge
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

# ---------------------------------------------------------------------------------------------
# Alarms (035 T097, Principle VII).
#
# The triggers emit CloudWatch EMF on stdout (no SDK call, no latency inside the 5-second wall);
# these turn three of those metrics into pages.
#
# ⚠ THE THIRD ONE IS THE ONE PEOPLE FORGET. The issuance store fails OPEN by design — a DynamoDB
# blip must not become a sign-in outage for four audiences — which means a silent outage would
# silently disable the per-address rate limit and nothing would ever say so. That alarm is the only
# thing standing between "degraded" and "unprotected".
# ---------------------------------------------------------------------------------------------

# A spike in failed verifications across many addresses is a distributed guessing campaign. Cognito
# no longer sees it — this is OUR metric now, and nothing else is watching.
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
}

# ⚠ The triggers fail CLOSED. An error here is not a degraded experience — it is nobody being able
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
}

# ⚠ See the header. Any value above zero means the per-address limit is not being enforced.
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
}
