# 116 - who may open Effy's links, and whether iPhone pushes may be time-sensitive. Both off until the operator
# supplies the identities (variables.tf, no defaults). See specs/116-links-badges-urgency/research.md R3, R8, R9.

locals {
  # customer-web builds /.well-known/assetlinks.json and /.well-known/apple-app-site-association from these
  # (static at build: redeploy customer-web after a change). "" = the file is a 404.
  app_link_env = {
    APP_LINK_ANDROID_SHA256 = join(",", var.android_app_cert_sha256)
    APP_LINK_APPLE_APP_ID   = var.apple_team_id == "" ? "" : "${var.apple_team_id}.${var.apple_customer_bundle_id}"
  }
}

# Read by the notifications service (APPLE_TEAM_ID): time-sensitive pushes only when this is a real team id. SSM refuses
# an empty string, so "off" is stored as `off` - readers accept only ^[A-Z0-9]{10}$.
resource "aws_ssm_parameter" "apple_team_id" {
  name        = "/effy/${var.env}/apple/team_id"
  description = "The Apple Developer team id, or `off` before the paid account (116). Read by edge-notifications; redeploy it after a change."
  type        = "String"
  value       = var.apple_team_id == "" ? "off" : var.apple_team_id
  tier        = "Standard"
}
