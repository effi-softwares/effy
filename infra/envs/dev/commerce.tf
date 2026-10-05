# Shopper-facing backend services — 070-retire-core-api.
#
# `storefront` and `commerce` are Serverless services (apis/edge-api/{storefront,commerce}); like
# every edge service they attach to the shared HTTP API and read their wiring from the parameter
# store at deploy time. This file publishes the two things they need that nothing else did:
#
#   1. where the SHOPPER database role's credentials are, and
#   2. where the payment-provider secrets are.
#
# ⚠ IT CREATES NO SECRET AND HOLDS NO SECRET VALUE. All three secrets are operator-created and are
# looked up here by NAME for their ARNs, so no password or key ever enters Terraform state:
#
#   /effy/<env>/db/shopper              — created by `make db-shopper-role ENV=<env>`
#   /effy/<env>/stripe/secret_key       — operator-created (019)
#   /effy/<env>/stripe/webhook_secret   — operator-created (019)
#
# A missing one fails this root's plan loudly, which is correct: a service deployed against a
# parameter that points nowhere fails at its first request instead.
#
# ── ORDER (quickstart Stage 1) ──
#   make db-up            → the migration creates role effy_shopper, with no password
#   make db-shopper-role  → sets a password, creates /effy/<env>/db/shopper
#   make apply            → THIS file can now resolve that secret and publish its ARN

# ── 1. The shopper database role ──────────────────────────────────────────────────────────────────
#
# Shopper services connect as a role with a CONNECTION LIMIT rather than as the master user, so a
# burst of shopper traffic is refused at the database instead of taking the connections the shop
# console, the driver app and the back office share (specs/070-retire-core-api/research.md R4).

data "aws_secretsmanager_secret" "db_shopper" {
  name = "/effy/${var.env}/db/shopper"
}

resource "aws_ssm_parameter" "db_shopper_username" {
  name        = "/effy/${var.env}/db/shopper_username"
  description = "The database role shopper-facing edge services (storefront, commerce) connect as. Connection-limited; created by the shopper_role migration."
  type        = "String"
  value       = "effy_shopper"
  tier        = "Standard"
}

resource "aws_ssm_parameter" "db_shopper_secret_arn" {
  name        = "/effy/${var.env}/db/shopper_secret_arn"
  description = "ARN of the Secrets Manager secret holding the shopper role's credentials ({username,password}). Written by make db-shopper-role."
  type        = "String"
  value       = data.aws_secretsmanager_secret.db_shopper.arn
  tier        = "Standard"
}

# ── 2. The payment-provider secrets ───────────────────────────────────────────────────────────────
#
# Looked up by name for their ARNs. They must exist before apply; a missing one fails loudly here.
#
# ⚠ Three services move money (commerce, orders, shop) and each is granted read on the secret key
# by its own serverless.yml. These lookups are the one place their ARNs are published.

data "aws_secretsmanager_secret" "stripe_secret_key" {
  name = "/effy/${var.env}/stripe/secret_key"
}

data "aws_secretsmanager_secret" "stripe_webhook_secret" {
  name = "/effy/${var.env}/stripe/webhook_secret"
}

resource "aws_ssm_parameter" "stripe_secret_key_arn" {
  name        = "/effy/${var.env}/stripe/secret_key_arn"
  description = "ARN of the payment provider's secret key. The VALUE is never in the parameter store, an environment variable or Terraform state — services fetch it at runtime by this ARN."
  type        = "String"
  value       = data.aws_secretsmanager_secret.stripe_secret_key.arn
  tier        = "Standard"
}

resource "aws_ssm_parameter" "stripe_webhook_secret_arn" {
  name        = "/effy/${var.env}/stripe/webhook_secret_arn"
  description = "ARN of the payment provider's webhook signing secret. Read only by the commerce service, which is the only one that receives provider notifications."
  type        = "String"
  value       = data.aws_secretsmanager_secret.stripe_webhook_secret.arn
  tier        = "Standard"
}
