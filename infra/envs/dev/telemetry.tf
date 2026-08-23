# ---------------------------------------------------------------------------------------------
# Telemetry config — 050-observability-push-foundation (PostHog product analytics + web error
# tracking). Principle VII; contract: specs/050-observability-push-foundation/contracts/config.contract.md
#
# These are NON-SECRET client config values (the PostHog PROJECT key is client-embeddable/public-safe,
# like the Cognito app-client id). They are the platform config contract in SSM; the six client
# surfaces read them at build time and no-op when a value is empty (FR-027/SC-007).
#
# ⚠ Real-World Identifiers: the PostHog key/host are OPERATOR-SUPPLIED (var.* from dev.tfvars), never
# guessed here. Empty defaults keep `make apply` working before the account exists — the clients simply
# no-op — rather than blocking every apply (fail-quiet no-op, not a wrong guess).
# ---------------------------------------------------------------------------------------------

# The PostHog ingest host for the chosen region (FR-029). PostHog offers US (https://us.i.posthog.com)
# or EU (https://eu.i.posthog.com); the operator picks the one matching the platform's jurisdiction.
# ⚠ count guard: SSM rejects an empty String value, and these are optional (empty in an env that
# hasn't provisioned PostHog yet). Absent param ⇒ the reader treats telemetry as unconfigured (no-op).
resource "aws_ssm_parameter" "telemetry_posthog_host" {
  count = var.posthog_host != "" ? 1 : 0
  name  = "/effy/${var.env}/telemetry/posthog_host"
  type  = "String"
  value = var.posthog_host
  tier  = "Standard"
}

# The PostHog PROJECT API key (phc_...). Client-embeddable / public-safe — not a secret.
resource "aws_ssm_parameter" "telemetry_posthog_project_key" {
  count = var.posthog_project_key != "" ? 1 : 0
  name  = "/effy/${var.env}/telemetry/posthog_project_key"
  type  = "String"
  value = var.posthog_project_key
  tier  = "Standard"
}

# Platform-wide analytics kill switch (FR-026). Gates client analytics init BEFORE any SDK loads.
# Scope is analytics ONLY — crash reporting and push are unaffected (spec clarification Q3).
resource "aws_ssm_parameter" "telemetry_enabled" {
  name  = "/effy/${var.env}/telemetry/enabled"
  type  = "String"
  value = var.telemetry_enabled ? "true" : "false"
  tier  = "Standard"
}
