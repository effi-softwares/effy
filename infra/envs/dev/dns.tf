# dev's DNS namespace + its email sending identity (010-domain-dns-foundation).
#
# Adding qa/staging is this file, copied, with env = "qa" — no new design (spec FR-007).

# The parent zone is looked up BY NAME, not imported from another root's remote state (research R1).
# No cross-root state coupling: this env root knows only the domain, and the parent zone is owned by
# infra/global/ — a root that is deliberately NOT an environment, so `make destroy ENV=dev` can never
# take the platform's apex with it.
data "aws_route53_zone" "parent" {
  name         = var.root_domain
  private_zone = false
}

# dev.effyshopping.com — the zone, the NS delegation written back into the parent, and the wildcard
# certificate every dev endpoint will use.
module "dns" {
  source = "../../modules/dns-env-zone"

  env            = var.env
  parent_domain  = var.root_domain
  parent_zone_id = data.aws_route53_zone.parent.zone_id
}

# The environment sends as ITS OWN namespace (no-reply@dev.effyshopping.com), never the apex — so a
# burst of bounced dev OTPs can never spend the production domain's sending reputation, which is a
# real and hard-to-reverse asset (spec FR-018 / SC-014).
module "ses" {
  source = "../../modules/ses-domain-identity"

  domain  = module.dns.zone_name
  zone_id = module.dns.zone_id
  region  = var.aws_region
}

# ── Letting Cognito send through the identity ─────────────────────────────────────────────────
#
# ⚠ THIS LIVES IN THE ROOT, NOT THE MODULE, ON PURPOSE — it breaks a cycle.
# The four pools need module.ses.identity_arn (their source_arn). If the ses module also took the
# four pool ARNs, the two would depend on each other and Terraform would refuse the graph. Hoisting
# just this one resource into the root makes the dependency a clean line:
#     ses → pools → this policy
data "aws_iam_policy_document" "cognito_ses_send" {
  statement {
    sid       = "AllowCognitoToSendAsEffy"
    effect    = "Allow"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = [module.ses.identity_arn]

    principals {
      type        = "Service"
      identifiers = ["cognito-idp.amazonaws.com"]
    }

    # Only OUR four pools may send through this identity.
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.aws_account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values = [
        module.customer_pool.user_pool_arn,
        module.driver_pool.user_pool_arn,
        module.shop_pool.user_pool_arn,
        module.back_office_pool.user_pool_arn,
      ]
    }
  }
}

resource "aws_ses_identity_policy" "cognito" {
  identity = module.ses.identity_arn
  name     = "${module.shared.name_prefix}-cognito-send"
  policy   = data.aws_iam_policy_document.cognito_ses_send.json
}

# ── The pools' email configuration ────────────────────────────────────────────────────────────
#
# ⚠ TWO-STAGE BY NECESSITY (discovered in implementation — see tasks.md T028a):
# Cognito REJECTS a source_arn whose SES identity is not yet VERIFIED. Verification is asynchronous:
# AWS polls for the DKIM records this apply creates, which takes minutes AFTER the apply returns.
# So the first apply creates the identity and its records with the pools still on the built-in
# sender; once `make mail-verify ENV=dev` reports verified, flip ses_sender_enabled = true in
# dev.tfvars and apply again. The flag makes that gate explicit instead of a mysterious failure.
locals {
  pool_email_configuration = var.ses_sender_enabled ? {
    email_sending_account = "DEVELOPER"
    source_arn            = module.ses.identity_arn
    from_email_address    = module.ses.from_address
    # No reply-to: the platform cannot RECEIVE mail. An address that silently bounces replies is
    # worse than no address at all (spec FR-022).
    reply_to_email_address = null
    } : {
    email_sending_account  = try(var.email_configuration.email_sending_account, "COGNITO_DEFAULT")
    source_arn             = try(var.email_configuration.source_arn, null)
    from_email_address     = try(var.email_configuration.from_email_address, null)
    reply_to_email_address = try(var.email_configuration.reply_to_email_address, null)
  }
}

# ── Alarms (Principle VII, research R9) ───────────────────────────────────────────────────────
# Both exist because these are the two things this slice makes able to fail SILENTLY and TOTALLY.

# SC-006 claims certificate renewal needs zero human actions. That is true ONLY while the DNS
# validation record still resolves — delete it and renewal fails quietly, with no symptom at all
# until the endpoint abruptly goes untrusted at expiry. This alarm is what makes the claim safe to
# rely on rather than merely hoped for.
resource "aws_cloudwatch_metric_alarm" "cert_expiry" {
  alarm_name          = "${module.shared.name_prefix}-cert-days-to-expiry"
  namespace           = "AWS/CertificateManager"
  metric_name         = "DaysToExpiry"
  dimensions          = { CertificateArn = module.dns.certificate_arn }
  statistic           = "Minimum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = 30
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_description   = "ACM cert renews automatically ONLY while its DNS validation record resolves. Firing here means renewal is broken — the endpoint will go untrusted at expiry."
}

# Breaching AWS's reputation thresholds PAUSES SENDING. On this platform that means no one on ANY of
# the four audiences can obtain a sign-in code — and there is no password fallback anywhere. This is
# the single highest-severity failure mode the slice introduces.
resource "aws_cloudwatch_metric_alarm" "ses_bounce_rate" {
  alarm_name          = "${module.shared.name_prefix}-ses-bounce-rate"
  namespace           = "AWS/SES"
  metric_name         = "Reputation.BounceRate"
  statistic           = "Average"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 0.05
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_description   = "SES bounce rate > 5%. AWS pauses sending past this — which means NOBODY can sign in (EMAIL_OTP is the only credential)."
}

resource "aws_cloudwatch_metric_alarm" "ses_complaint_rate" {
  alarm_name          = "${module.shared.name_prefix}-ses-complaint-rate"
  namespace           = "AWS/SES"
  metric_name         = "Reputation.ComplaintRate"
  statistic           = "Average"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 0.001
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_description   = "SES complaint rate > 0.1%. AWS pauses sending past this — which means NOBODY can sign in."
}

output "dns_zone_name" {
  description = "This env's namespace (dev.effyshopping.com)."
  value       = module.dns.zone_name
}

output "dns_zone_name_servers" {
  description = "The dev zone's name-servers (already delegated from the parent — informational)."
  value       = module.dns.name_servers
}

output "ses_from_address" {
  description = "The sender all four pools use once ses_sender_enabled = true."
  value       = module.ses.from_address
}
