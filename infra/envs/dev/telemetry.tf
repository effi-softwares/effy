# Telemetry config: the PostHog project key and host (client-embeddable, like an app-client id), published
# to SSM for the client surfaces, which no-op when empty. Operator-supplied (var.* from dev.tfvars); the
# empty defaults let `make apply` run before the account exists.

# The PostHog ingest host for the chosen region. PostHog offers US (https://us.i.posthog.com)
# or EU (https://eu.i.posthog.com); the operator picks the one matching the platform's jurisdiction.
# count guard: SSM rejects an empty String value, and these are optional (empty in an env that
# hasn't provisioned PostHog yet). Absent param ⇒ the reader treats telemetry as unconfigured (no-op).
resource "aws_ssm_parameter" "telemetry_posthog_host" {
  count = var.posthog_host != "" ? 1 : 0
  name  = "/effy/${var.env}/telemetry/posthog_host"
  type  = "String"
  value = var.posthog_host
  tier  = "Standard"
}

# The PostHog project API key (phc_...). Client-embeddable / public-safe - not a secret.
resource "aws_ssm_parameter" "telemetry_posthog_project_key" {
  count = var.posthog_project_key != "" ? 1 : 0
  name  = "/effy/${var.env}/telemetry/posthog_project_key"
  type  = "String"
  value = var.posthog_project_key
  tier  = "Standard"
}

# Platform-wide analytics kill switch. Gates client analytics init before any SDK loads.
# Scope is analytics only - crash reporting and push are unaffected (spec clarification Q3).
resource "aws_ssm_parameter" "telemetry_enabled" {
  name  = "/effy/${var.env}/telemetry/enabled"
  type  = "String"
  value = var.telemetry_enabled ? "true" : "false"
  tier  = "Standard"
}
