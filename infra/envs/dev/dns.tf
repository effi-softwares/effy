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

  # 037: attach the outcome pipeline as this identity's DEFAULT configuration set, and give the
  # namespace's DMARC record a reporting address so monitor mode collects something.
  configuration_set_name = module.ses_events.configuration_set_name
  dmarc_rua              = var.dmarc_rua
}

# ── Per-message delivery outcomes (037-platform-email-delivery) ───────────────────────────────
# The configuration set + the topic its outcomes land on. Everything that sends mail in this
# environment attaches to this set, so a failure to reach ONE person is visible — which the
# account-wide reputation alarms below structurally cannot be.
module "ses_events" {
  source = "../../modules/ses-events"

  name_prefix    = module.shared.name_prefix
  aws_account_id = var.aws_account_id

  # ⚠ [] in dev — see the variable's own documentation. This is what stops a mistyped dev address
  # from permanently blocking a real customer in production (FR-041).
  suppressed_reasons = var.ses_suppressed_reasons
}

# ── App↔infra contract: /effy/<env>/ses/* ─────────────────────────────────────────────────────
#
# ⚠ THE DEFECT THIS ENDS: the sender address existed in THREE places in TWO shapes — hardcoded as
# `no-reply@${sls:stage}.effyshopping.com` in both apis/edge-api/auth/serverless.yml and
# apis/edge-api/customer/serverless.yml, and as `Effy <no-reply@…>` here. They had ALREADY drifted,
# so the Lambdas sent with no display name while Cognito would send with one. One writer, many
# readers (Principle II; contracts/ssm-mail.contract.md).
locals {
  # The ONE definition of who Effy is in a recipient's inbox. Both the SSM contract and Cognito's
  # own configuration read this — never two literals that can disagree.
  mail_sender = module.ses.from_address
  # Customer-facing reply address — the public support mailbox.
  mail_reply_to = "hello@${var.root_domain}"
  # ⚠ 038 FR-037: internal audiences (driver/shop/back-office) reply to the OPERATIONAL mailbox.
  # `workspace-admin@` is one of the two constitution-approved addresses; deriving it here (rather
  # than accepting a parameter) is what keeps a third address structurally impossible.
  mail_reply_to_internal = "workspace-admin@${var.root_domain}"
}

resource "aws_ssm_parameter" "ses_sender" {
  name        = "/effy/${var.env}/ses/sender"
  description = "The platform's sender for this environment, display name included. Read by every service that sends mail."
  type        = "String"
  value       = local.mail_sender
  tier        = "Standard"
}

resource "aws_ssm_parameter" "ses_reply_to" {
  name        = "/effy/${var.env}/ses/reply_to"
  description = "Where replies to automated mail go — the operator's monitored mailbox. 037 FR-022 REVERSES 010's FR-022, whose reason (the platform could not receive mail) no longer holds."
  type        = "String"
  value       = local.mail_reply_to
  tier        = "Standard"
}

resource "aws_ssm_parameter" "ses_configuration_set" {
  name        = "/effy/${var.env}/ses/configuration_set"
  description = "Configuration set every sender passes explicitly, so each send is attributable to a per-message outcome."
  type        = "String"
  value       = module.ses_events.configuration_set_name
  tier        = "Standard"
}

# ── 038 additions to the app↔infra mail contract ──────────────────────────────────────────────

resource "aws_ssm_parameter" "ses_reply_to_internal" {
  name        = "/effy/${var.env}/ses/reply_to_internal"
  description = "Reply address for INTERNAL-audience mail (driver/shop/back-office) — the operational mailbox. email-kit derives the reply per audience; empty here would fall back to the public reply (038 FR-037)."
  type        = "String"
  value       = local.mail_reply_to_internal
  tier        = "Standard"
}

resource "aws_ssm_parameter" "mail_nonprod_allowlist" {
  name = "/effy/${var.env}/mail/nonprod_allowlist"
  description = join(" ", [
    "⚠ Non-production recipient allowlist (038 FR-043). Comma-separated exact addresses and/or @domain",
    "entries. In any env that is not prod, email-kit REFUSES any recipient not on this list (the",
    "mailbox simulator is always allowed). ⚠ EMPTY = refuse everyone but the simulator — the safe",
    "fail-closed default. The operator sets it in dev.tfvars before the first live sign-in walk.",
  ])
  type  = "String"
  value = var.mail_nonprod_allowlist
  tier  = "Standard"
}

resource "aws_ssm_parameter" "mail_postal_address" {
  name = "/effy/${var.env}/mail/postal_address"
  description = join(" ", [
    "⚠ Operator-supplied postal address for the email footer (constitution: Real-World Identifiers).",
    "Optional at runtime for TRANSACTIONAL mail (CAN-SPAM-exempt) — empty omits the footer line rather",
    "than shipping a guessed address. ⚠ LIFECYCLE mail must enforce presence where such a message is",
    "authored. A validation refuses an obvious placeholder if a value IS given.",
  ])
  type  = "String"
  value = var.mail_postal_address
  tier  = "Standard"
}

# ⚠ THE PERMISSION HALF OF THE LINE ABOVE, AND IT IS NOT OPTIONAL.
#
# `ses:SendEmail` authorizes against EVERY resource the request touches. A send that names a
# configuration set touches two: the identity AND the configuration set. A policy granting only the
# identity therefore DENIES the call outright — with `AccessDeniedException`, which says nothing
# about which resource was missing.
#
# ⚠ THIS SHIPPED BROKEN AND CAUSED A TOTAL SIGN-IN OUTAGE. Before 037 the senders passed no
# configuration set, so the identity-only grant was sufficient and correct. 037 added
# `ConfigurationSetName` to every send WITHOUT widening the grant, so every code email failed on all
# four pools — and because a failed send is a failed sign-in on the three passwordless audiences,
# nobody could sign in at all. The only signal was `otp_send_failed` and one log line reading
# `{"stage":"ses-send","error":"AccessDeniedException"}`.
resource "aws_ssm_parameter" "ses_configuration_set_arn" {
  name        = "/effy/${var.env}/ses/configuration_set_arn"
  description = "ARN of the configuration set. Every ses:SendEmail grant MUST name this alongside the identity — a send that specifies a configuration set is authorized against both."
  type        = "String"
  value       = module.ses_events.configuration_set_arn
  tier        = "Standard"
}

resource "aws_ssm_parameter" "ses_events_topic_arn" {
  name        = "/effy/${var.env}/ses/events_topic_arn"
  description = "SNS topic carrying delivery outcomes. The admin service subscribes to it from serverless.yml."
  type        = "String"
  value       = module.ses_events.events_topic_arn
  tier        = "Standard"
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
    from_email_address    = local.mail_sender

    # ⚠ 037 REVERSES 010's FR-022. That rule set this to null because "the platform cannot RECEIVE
    # mail, and an address that silently bounces replies is worse than no address at all." The
    # reasoning was right and its premise is gone: the apex now routes to the operator's mailbox.
    # A shopper who cannot sign in and hits reply on their code email is the highest-intent support
    # signal this platform will ever get, and it used to vanish.
    #
    # ⚠ Read from the SAME local the SSM contract publishes — one literal, two consumers. Writing
    # the address here a second time would re-create in miniature the exact drift this slice exists
    # to end (FR-004).
    reply_to_email_address = local.mail_reply_to

    # 037 FR-024: attributes Cognito's own mail — sign-up confirmation, password recovery,
    # email-change and both step-up codes — to the outcome pipeline. Without this, four of the five
    # code-bearing flows would send with no per-message visibility at all.
    #
    # ⚠ Only meaningful under DEVELOPER. Under COGNITO_DEFAULT, Cognito uses its own internal sender
    # and the configuration set is inert.
    configuration_set = module.ses_events.configuration_set_name
    } : {
    email_sending_account  = try(var.email_configuration.email_sending_account, "COGNITO_DEFAULT")
    source_arn             = try(var.email_configuration.source_arn, null)
    from_email_address     = try(var.email_configuration.from_email_address, null)
    reply_to_email_address = try(var.email_configuration.reply_to_email_address, null)
    # Inert under COGNITO_DEFAULT — Cognito uses its own internal sender. Present so both branches
    # produce the same object shape.
    configuration_set = null
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
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
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
  alarm_actions       = [aws_sns_topic.alerts.arn]
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
  alarm_actions       = [aws_sns_topic.alerts.arn]
  alarm_description   = "SES complaint rate > 0.1%. AWS pauses sending past this — which means NOBODY can sign in."
}

# ── 037: the alarms that see ONE person, not a rate ───────────────────────────────────────────
#
# ⚠ WHY THE RATE ALARMS ABOVE ARE NOT ENOUGH. A single customer whose address hard-bounces never
# moves a percentage — and that one person is permanently locked out of an account that, for three
# of the four audiences, has no other credential. The rate alarms protect the ACCOUNT; these
# protect a PERSON.
resource "aws_cloudwatch_metric_alarm" "mail_hard_bounce" {
  alarm_name          = "${module.shared.name_prefix}-mail-hard-bounce"
  namespace           = "Effy/Mail"
  metric_name         = "mail_hard_bounce"
  dimensions          = { env = var.env }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  alarm_description   = "A permanent delivery failure was recorded. Someone may now be unable to sign in at all — check the back-office deliverability view and repair if the address is recoverable."
}

# ⚠ THIS ALARM EXISTS BECAUSE AWS PROVIDES NO SIGNAL FOR IT (research R11).
# There is no CloudWatch metric and no EventBridge event for a broken custom MAIL FROM. The only
# native notification is an email to the AWS ACCOUNT ROOT ADDRESS, which on a solo-operator project
# is exactly as unmonitored as the gap this slice is closing. So the platform polls and publishes
# its own metric (apis/edge-api/admin ses-identity-health, hourly).
#
# The failure it catches is silent by construction: with behavior_on_mx_failure = USE_DEFAULT_VALUE
# (the right choice — the alternative makes every send fail, i.e. nobody signs in), SES quietly
# falls back to an amazonses.com envelope. Mail keeps flowing. What breaks is SPF alignment, so
# deliverability decays at the receiver over DAYS and the rate alarms fire only after the damage.
#
# ⚠ treat_missing_data = "breaching" is deliberate: a probe that stops running must TRIP this alarm,
# not silence it.
resource "aws_cloudwatch_metric_alarm" "mail_from_unhealthy" {
  alarm_name          = "${module.shared.name_prefix}-mail-from-unhealthy"
  namespace           = "Effy/Mail"
  metric_name         = "mail_from_domain_healthy"
  dimensions          = { env = var.env }
  statistic           = "Minimum"
  period              = 3600
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  alarm_description   = "The custom MAIL FROM is not in SUCCESS, or the hourly probe stopped reporting. Mail still sends but SPF alignment is degraded — and the Failed state is TERMINAL: SES stops retrying after 72h and setup must be restarted by hand."
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
