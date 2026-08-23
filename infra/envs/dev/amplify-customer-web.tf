# Customer storefront continuous deployment (042-customer-web-cicd).
#
# Amplify Hosting's native Git pipeline builds ONLY apps/customer-web (scoped by the repo-root
# amplify.yml, which declares exactly one application) and serves it at dev.effyshopping.com.
#
# ⚠ OPERATOR PREREQUISITES (out-of-code — constitution: Real-World Identifiers). These SSM keys must
# exist before the relevant apply, and a missing one fails the plan LOUDLY (the data source errors)
# rather than carrying a guess:
#   /effy/dev/amplify/github_access_token   (SecureString)  — the Amplify→GitHub connection token.
#         Create via the Amplify GitHub App (preferred) or a fine-grained PAT; see quickstart §0.
#   /effy/dev/stripe/publishable_key        (String)        — the PUBLIC, browser-safe Stripe test key.
# 050 — PostHog IS wired now (env vars below, from var.posthog_project_key / var.posthog_host in
# dev.tfvars). The project key is client-embeddable/public-safe; an empty value leaves analytics a
# no-op. This closes the long-standing "customer-web never initialised PostHog" carry-forward (039).

# ── Operator-supplied inputs (read, never written by this slice) ───────────────────────────────
data "aws_ssm_parameter" "amplify_github_token" {
  name            = "/effy/${var.env}/amplify/github_access_token"
  with_decryption = true
}

data "aws_ssm_parameter" "stripe_publishable_key" {
  name = var.stripe_publishable_key_ssm
}

# ── The app ↔ storefront config (contracts/config.contract.md) ─────────────────────────────────
#
# In-account platform facts come from Terraform references (no drift, no operator step). NEXT_PUBLIC_*
# are inlined into the browser bundle at build and are all public-safe (a pool id, a client id, a
# publishable key).
#
# ⚠ EVERY VARIABLE HERE MUST CARRY THE NEXT_PUBLIC_ PREFIX, INCLUDING THE EDGE API'S ADDRESS.
# An Amplify environment variable is a BUILD-time variable: AWS states that "a Next.js server
# component doesn't have access to those environment variables by default." Only NEXT_PUBLIC_
# values survive the build, because Next inlines them into the output. This block previously set
# `EDGE_API_BASE_URL` unprefixed on the reasoning that server-only config should stay server-only
# (FR-016) — correct in principle, and the variable was simply ABSENT at runtime: every signed-in
# customer on dev was redirected to /account/unavailable, with no failed request in the browser
# because the code threw before it could make one.
#
# ⚠ Adding a server-only variable here in future does NOT work. It needs `.env.production` written
# during the build (AWS: "Making environment variables accessible to server-side runtimes"), or it
# will be silently undefined in production exactly as this one was.
locals {
  storefront_url = "https://${module.dns.zone_name}"                           # https://dev.effyshopping.com
  core_api_url   = "https://${var.core_api_subdomain}.${module.dns.zone_name}" # https://core-api.dev.effyshopping.com
  edge_api_url   = "https://${var.api_subdomain}.${module.dns.zone_name}"      # https://edge-api.dev.effyshopping.com

  customer_web_env = {
    # public (inlined at build)
    NEXT_PUBLIC_SITE_URL               = local.storefront_url
    NEXT_PUBLIC_CORE_API_BASE_URL      = local.core_api_url
    NEXT_PUBLIC_COGNITO_USER_POOL_ID   = module.customer_pool.user_pool_id
    NEXT_PUBLIC_COGNITO_CLIENT_ID      = module.customer_pool.app_client_id
    NEXT_PUBLIC_COGNITO_DOMAIN         = "" # set only when Google federation is enabled
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = data.aws_ssm_parameter.stripe_publishable_key.value
    # The cold path. Public-SAFE (an address, not a credential — the gateway's per-pool JWT
    # authorizer refuses an unauthenticated caller with a flat 401), but read ONLY from server code:
    # the account routes relay the customer's tokens. See apps/customer-web/lib/config.ts.
    NEXT_PUBLIC_EDGE_API_BASE_URL = local.edge_api_url
    # 050 — PostHog (analytics + web error tracking). The PROJECT key is client-embeddable/public-safe
    # (like the Cognito client id above); inlined at build. Same source as the SSM record (var.*), so
    # setting it once in dev.tfvars fans out to SSM AND this build. Empty ⇒ analytics no-ops.
    NEXT_PUBLIC_POSTHOG_KEY       = var.posthog_project_key
    NEXT_PUBLIC_POSTHOG_HOST      = var.posthog_host
    NEXT_PUBLIC_TELEMETRY_ENABLED = var.telemetry_enabled ? "true" : "false"
  }
}

module "amplify_customer_web" {
  source = "../../modules/amplify-web-app"

  name           = "${module.shared.name_prefix}-customer-web"
  repository_url = var.amplify_repository_url
  access_token   = data.aws_ssm_parameter.amplify_github_token.value

  deploy_branch = var.amplify_deploy_branch
  app_root      = "apps/customer-web"
  framework     = "Next.js - SSR"
  stage         = "DEVELOPMENT"

  env_vars = local.customer_web_env

  # ⚠ Amplify's build cannot reliably assume a Terraform-created service role (SSR IaC edge case).
  # Empty = Terraform creates one (may fail with "Unable to assume specified IAM Role"). The working
  # path: let Amplify auto-create the role in the console once, then set this to that ARN so TF just
  # references it. See var.amplify_service_role_arn and quickstart §2a.
  service_role_arn = var.amplify_service_role_arn

  # Two-stage cutover (var.amplify_domain_enabled, quickstart §2–3). Empty domain = stage A.
  domain_name = var.amplify_domain_enabled ? module.dns.zone_name : ""
  enable_www  = true
}

# ── App↔infra contract output: /effy/<env>/web/site_url (contracts/config.contract.md) ─────────
#
# ⚠ CLOSES A 039 OPEN ITEM. apis/edge-api/customer/serverless.yml reads this for the newsletter
# double-opt-in confirm link and currently falls back to http://localhost:3000 because the key does
# not exist. After this applies, redeploy edge-customer (quickstart §4) so the link points at the
# real storefront.
resource "aws_ssm_parameter" "web_site_url" {
  name        = "/effy/${var.env}/web/site_url"
  description = "The customer storefront's public origin for this environment. Read by edge-customer (newsletter confirm link) and any public-URL consumer (042)."
  type        = "String"
  value       = local.storefront_url
  tier        = "Standard"
}

# ── Build-failure notification (Principle VII, research D9) ────────────────────────────────────
#
# The one failure mode this slice introduces: a build/deploy fails. Amplify keeps the last good
# version live (that is native), but nobody is told. Route Amplify's FAILED deployment event to the
# existing operator alert topic (037's aws_sns_topic.alerts) so a broken pipeline pages someone.
resource "aws_cloudwatch_event_rule" "amplify_build_failed" {
  name        = "${module.shared.name_prefix}-customer-web-build-failed"
  description = "Amplify deployment FAILED for the customer storefront — the pipeline is broken; the last good version is still live."

  event_pattern = jsonencode({
    source        = ["aws.amplify"]
    "detail-type" = ["Amplify Deployment Status Change"]
    detail = {
      appId     = [module.amplify_customer_web.app_id]
      jobStatus = ["FAILED"]
    }
  })
}

resource "aws_cloudwatch_event_target" "amplify_build_failed_to_sns" {
  rule      = aws_cloudwatch_event_rule.amplify_build_failed.name
  target_id = "alerts"
  arn       = aws_sns_topic.alerts.arn
}

# ⚠ EventBridge needs resource-based permission to publish to the topic. This policy PRESERVES the
# default account-owner statement (so 037's CloudWatch alarms keep delivering) and ADDS publish
# rights for EventBridge and CloudWatch. Omitting the default statement would silently break the
# platform's sign-in-outage alarms — the exact "detection without notification" defect 037 fixed.
data "aws_iam_policy_document" "alerts_topic" {
  # The AWS default: the owning account may manage + publish to its own topic.
  statement {
    sid       = "DefaultAccountOwner"
    effect    = "Allow"
    actions   = ["SNS:Publish", "SNS:Subscribe", "SNS:GetTopicAttributes", "SNS:SetTopicAttributes", "SNS:AddPermission", "SNS:RemovePermission", "SNS:DeleteTopic", "SNS:ListSubscriptionsByTopic", "SNS:Receive"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceOwner"
      values   = [var.aws_account_id]
    }
  }

  # EventBridge (this slice) + CloudWatch alarms (037) publish notifications.
  statement {
    sid       = "ServicePublish"
    effect    = "Allow"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com", "cloudwatch.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [var.aws_account_id]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts_topic.json
}

output "customer_web_app_id" {
  description = "Amplify app id for the customer storefront."
  value       = module.amplify_customer_web.app_id
}

output "customer_web_url" {
  description = "The storefront URL (Amplify default hostname pre-cutover; dev.effyshopping.com after)."
  value       = module.amplify_customer_web.storefront_url
}
