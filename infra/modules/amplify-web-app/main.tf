# The Amplify Hosting app for one monorepo web surface (042-customer-web-cicd).
#
# Shape (data-model.md E1/E2/E6): one aws_amplify_app (WEB_COMPUTE, Git-connected, monorepo-scoped) +
# one aws_amplify_branch (auto-build) + an optional custom-domain association.

locals {
  # AMPLIFY_MONOREPO_APP_ROOT is not an operator choice — it is derived from app_root so it can never
  # drift from the amplify.yml appRoot (research D2). Merged over the caller's env_vars.
  environment_variables = merge(var.env_vars, {
    AMPLIFY_MONOREPO_APP_ROOT = var.app_root
  })
}

# ── Amplify service role (required for WEB_COMPUTE / SSR ONLY) ──────────────────────────────────
#
# Amplify assumes this role to run the SSR build/compute and write its logs. The only permission it
# needs for a hosting-only SSR app is CloudWatch Logs under /aws/amplify/*. (No Gen2 backend here, so
# no broad AmplifyBackendDeployFullAccess.)
#
# ⚠ STATIC (WEB) APPS NEED NO ROLE AT ALL (048, research D2). A Vite SPA has no server runtime, so
# `needs_managed_role` is false for platform == "WEB" and this whole block is inert — the app sets
# iam_service_role_arn = null. The "Unable to assume specified IAM Role" failure is a WEB_COMPUTE-only
# concern.
#
# ⚠ TRUST MUST INCLUDE BOTH `amplify.amazonaws.com` AND `lambda.amazonaws.com` (SSR runtime is
# Lambda-backed). Created ONLY when WEB_COMPUTE and var.service_role_arn is empty. See that variable's
# warning: an Amplify-created role is the reliable path, so the recommended SSR flow passes an external
# ARN and this block is inert.
locals {
  needs_managed_role = var.platform == "WEB_COMPUTE" && var.service_role_arn == ""
}

data "aws_iam_policy_document" "amplify_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["amplify.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "amplify" {
  count              = local.needs_managed_role ? 1 : 0
  name               = "${var.name}-amplify"
  assume_role_policy = data.aws_iam_policy_document.amplify_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "amplify_logs" {
  statement {
    sid    = "SsrComputeLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogGroups",
    ]
    resources = ["arn:aws:logs:*:*:log-group:/aws/amplify/*:log-stream:*", "arn:aws:logs:*:*:log-group:/aws/amplify/*"]
  }
}

resource "aws_iam_role_policy" "amplify_logs" {
  count  = local.needs_managed_role ? 1 : 0
  name   = "ssr-compute-logs"
  role   = aws_iam_role.amplify[0].id
  policy = data.aws_iam_policy_document.amplify_logs.json
}

locals {
  # WEB (static): no role at all → null. WEB_COMPUTE: an external ARN if given, else the created role.
  service_role_arn = (
    var.platform == "WEB" ? null :
    var.service_role_arn != "" ? var.service_role_arn :
    aws_iam_role.amplify[0].arn
  )
}

resource "aws_amplify_app" "this" {
  name = var.name

  repository = var.repository_url
  # Operator-supplied token (SSM SecureString → env root → here). Amplify uses it once to create a
  # webhook + read-only deploy key.
  access_token = var.access_token

  # WEB_COMPUTE for Next.js 14+ SSR (storefront, 042); WEB for the static Vite SPA consoles (048).
  # "WEB" cannot detect or run an SSR app, and WEB_COMPUTE would demand a service role a static app
  # does not need — so this is a per-caller choice (research D2/D3).
  platform = var.platform

  # WEB_COMPUTE: the SSR compute needs a role Amplify can assume to write its logs, else the build
  # fails at step 0 with "Unable to assume specified IAM Role". WEB (static): null — no role exists
  # or is needed (local.service_role_arn resolves to null for WEB).
  iam_service_role_arn = local.service_role_arn

  # The repo-root amplify.yml is the source of truth for the build; it overrides anything set here.
  # Each Amplify app builds ONLY the applications[] entry matching its AMPLIFY_MONOREPO_APP_ROOT.

  environment_variables = local.environment_variables

  # ── SPA rewrite (custom rules) — 048 consoles pass the single-page-app rule; default [] (storefront)
  # A client-router SPA on static hosting must serve /index.html (status 200, a rewrite not a redirect)
  # for any non-asset path, or a deep-link refresh 404s (FR-011, research D3).
  dynamic "custom_rule" {
    for_each = var.custom_rules
    content {
      source = custom_rule.value.source
      target = custom_rule.value.target
      status = custom_rule.value.status
    }
  }

  enable_branch_auto_build    = var.enable_auto_build
  enable_branch_auto_deletion = false

  tags = var.tags
}

resource "aws_amplify_branch" "this" {
  app_id      = aws_amplify_app.this.id
  branch_name = var.deploy_branch

  framework         = var.framework
  stage             = var.stage
  enable_auto_build = var.enable_auto_build

  tags = var.tags
}

# ── Custom domain (optional; enabled once domain_name is set — the cutover apply) ───────────────
#
# ⚠ ROUTE53 RECORDS ARE MANAGED BY AMPLIFY, NOT BY THIS MODULE — a decision recorded during
# implementation (research D6, amended). Reasons: (1) the apex cannot be a CNAME and the association
# resource does not expose the CloudFront target cleanly, so a reliable Route53 ALIAS cannot be
# built in Terraform across provider versions; (2) Amplify natively creates + maintains the apex and
# subdomain records for a domain whose hosted zone lives in the SAME AWS account, which this one does
# (module.dns's zone). The env root REMOVES the old apex alias records (037's edge-domain.tf) so
# Amplify can claim the apex — see FR-012.
#
# ⚠ wait_for_verification = true blocks the apply until the association is verified. Because Amplify
# owns the records, there is no chicken-and-egg deadlock (that only arises when Terraform must create
# the validation record itself). If the apply hangs on "Creating records…", check the zone for a
# leftover apex A/AAAA or a stale _acm-validation CNAME and reconcile (quickstart §3).
#
# The ACM certificate is provisioned by Amplify in us-east-1 automatically (decision-locked: a
# CloudFront-fronted cert must live there). This module does not create a certificate.
resource "aws_amplify_domain_association" "this" {
  count = var.domain_name == "" ? 0 : 1

  app_id                 = aws_amplify_app.this.id
  domain_name            = var.domain_name
  wait_for_verification  = true
  enable_auto_sub_domain = false

  # subdomain_prefix → the deploy branch. "" = the zone apex (storefront, 042); "shop" /
  # "back-office" for the consoles (048, FR-010/FR-012).
  sub_domain {
    branch_name = aws_amplify_branch.this.branch_name
    prefix      = var.subdomain_prefix
  }

  # www → the deploy branch; Amplify serves it and redirects to the canonical apex (FR-010).
  # Apex-only concept — the consoles pass enable_www = false.
  dynamic "sub_domain" {
    for_each = var.enable_www ? [1] : []
    content {
      branch_name = aws_amplify_branch.this.branch_name
      prefix      = "www"
    }
  }
}
