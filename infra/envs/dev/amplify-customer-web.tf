# Customer storefront continuous deployment: Amplify Hosting builds only apps/customer-web (amplify.yml) and
# serves it at dev.effyshopping.com.
#
# Operator prerequisites, in SSM before the apply (a missing one fails the plan):
# /effy/dev/amplify/github_access_token (SecureString): the Amplify→GitHub token (the Amplify GitHub App,
# or a fine-grained PAT).
# /effy/dev/stripe/publishable_key (String): the public Stripe test key.
# PostHog comes from var.posthog_project_key / var.posthog_host (public-safe; empty leaves analytics off).

# ── Operator-supplied inputs (read, never written by this slice) ───────────────────────────────
data "aws_ssm_parameter" "amplify_github_token" {
  name            = "/effy/${var.env}/amplify/github_access_token"
  with_decryption = true
}

data "aws_ssm_parameter" "stripe_publishable_key" {
  name = var.stripe_publishable_key_ssm
}

# The storefront's config. In-account facts come from Terraform references; every value is public-safe
# (pool id, client id, publishable key).
#
# Every variable must carry NEXT_PUBLIC_: an Amplify environment variable is build-time only, and a server
# component cannot read an unprefixed one at runtime. A server-only variable would need `.env.production`
# written during the build.
locals {
  storefront_url = "https://${module.dns.zone_name}"                      # https://dev.effyshopping.com
  edge_api_url   = "https://${var.api_subdomain}.${module.dns.zone_name}" # https://edge-api.dev.effyshopping.com

  customer_web_env = {
    # public (inlined at build)
    NEXT_PUBLIC_SITE_URL               = local.storefront_url
    NEXT_PUBLIC_COGNITO_USER_POOL_ID   = module.customer_pool.user_pool_id
    NEXT_PUBLIC_COGNITO_CLIENT_ID      = module.customer_pool.app_client_id
    NEXT_PUBLIC_COGNITO_DOMAIN         = "" # set only when Google federation is enabled
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = data.aws_ssm_parameter.stripe_publishable_key.value
    # The cold path. Public-safe (an address, not a credential — the gateway's per-pool JWT
    # authorizer refuses an unauthenticated caller with a flat 401), but read only from server code:
    # the account routes relay the customer's tokens. See apps/customer-web/lib/config.ts.
    NEXT_PUBLIC_EDGE_API_BASE_URL = local.edge_api_url
    # PostHog (analytics + web error tracking). The project key is client-embeddable/public-safe
    # (like the Cognito client id above); inlined at build. Same source as the SSM record (var.*), so
    # setting it once in dev.tfvars fans out to ssm and this build. Empty ⇒ analytics no-ops.
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

  # Amplify's build cannot reliably assume a Terraform-created service role (SSR IaC edge case).
  # Empty = Terraform creates one (may fail with "Unable to assume specified IAM Role"). The working
  # path: let Amplify auto-create the role in the console once, then set this to that ARN so TF just
  # references it. See var.amplify_service_role_arn and quickstart §2a.
  service_role_arn = var.amplify_service_role_arn

  # Two-stage cutover (var.amplify_domain_enabled, quickstart §2–3). Empty domain = stage A.
  domain_name = var.amplify_domain_enabled ? module.dns.zone_name : ""
  enable_www  = true
}

# /effy/<env>/web/site_url: the storefront's address, read by the customer service (the newsletter confirm
# link). Redeploy `customer` after it changes.
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
# version live (that is native), but nobody is told. Route Amplify's failed deployment event to the
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

# EventBridge needs resource-based permission to publish to the topic. This policy preserves the
# default account-owner statement (so 037's CloudWatch alarms keep delivering) and adds publish
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

  # EventBridge (this slice) + CloudWatch alarms + the cost budget publish notifications.
  statement {
    sid       = "ServicePublish"
    effect    = "Allow"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com", "cloudwatch.amazonaws.com", "budgets.amazonaws.com"]
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
