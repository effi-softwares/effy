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

# ── Amplify service role (required for WEB_COMPUTE / SSR) ───────────────────────────────────────
#
# Amplify assumes this role to run the SSR build/compute and write its logs. The only permission it
# needs for a hosting-only SSR app is CloudWatch Logs under /aws/amplify/*. (No Gen2 backend here, so
# no broad AmplifyBackendDeployFullAccess.)
#
# ⚠ TRUST MUST INCLUDE BOTH `amplify.amazonaws.com` AND `lambda.amazonaws.com`. The SSR runtime is
# Lambda-backed, so a role trusted only by amplify fails to be assumed and the build dies at step 0
# with "Unable to assume specified IAM Role" (AWS SSR-compute-role docs; found live 2026-08-09).
data "aws_iam_policy_document" "amplify_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["amplify.amazonaws.com", "lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "amplify" {
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
  name   = "ssr-compute-logs"
  role   = aws_iam_role.amplify.id
  policy = data.aws_iam_policy_document.amplify_logs.json
}

resource "aws_amplify_app" "this" {
  name = var.name

  repository = var.repository_url
  # Operator-supplied token (SSM SecureString → env root → here). Amplify uses it once to create a
  # webhook + read-only deploy key.
  access_token = var.access_token

  # ⚠ REQUIRED for Next.js 14+ (customer-web is Next 16 SSR/PPR). "WEB" (static) cannot detect or
  # run the SSR app (research D3).
  platform = "WEB_COMPUTE"

  # ⚠ REQUIRED for WEB_COMPUTE: an SSR app cannot build/run without a service role Amplify can assume
  # — without it the build fails at the first step with "Unable to assume specified IAM Role". The
  # role's job is to let the SSR compute write its logs (research D3 / implementation 2026-08-09).
  iam_service_role_arn = aws_iam_role.amplify.arn

  # The repo-root amplify.yml is the source of truth for the build; it overrides anything set here.
  # It declares exactly ONE application, which is what confines the pipeline to apps/customer-web.

  environment_variables = local.environment_variables

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

  # Apex → the deploy branch (FR-009).
  sub_domain {
    branch_name = aws_amplify_branch.this.branch_name
    prefix      = ""
  }

  # www → the deploy branch; Amplify serves it and redirects to the canonical apex (FR-010).
  dynamic "sub_domain" {
    for_each = var.enable_www ? [1] : []
    content {
      branch_name = aws_amplify_branch.this.branch_name
      prefix      = "www"
    }
  }
}
