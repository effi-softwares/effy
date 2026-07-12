# One environment's email SENDING identity.
#
# WHY THIS MATTERS MORE THAN IT LOOKS: passwordless EMAIL_OTP is the ONLY credential this platform
# issues — customers, drivers, shop operators, and back-office staff all sign in with an emailed
# code, and there is no password fallback anywhere by design. So "can we send mail, and does it land
# in the inbox" is not deliverability polish; it is the availability of authentication itself.
#
# ⚠ THE SEVERE FAILURE MODE: if SES pauses sending (bounce > 5% or complaint > 0.1%), NOBODY on ANY
# of the four audiences can sign in. It is invisible until it is total. Hence the reputation alarms
# in the env root (research R9).
#
# NOTE: the SES identity POLICY that lets Cognito send through this identity is NOT here — it lives
# in the env root. Putting it here would create a module cycle (this module would need the pool ARNs,
# while the pools need this module's identity ARN for their source_arn). See infra/envs/dev/dns.tf.

locals {
  # Custom MAIL FROM subdomain. WITHOUT it the envelope sender is an amazonses.com address, so SPF
  # aligns to Amazon's domain rather than Effy's — DMARC would still pass on DKIM alone, but on one
  # leg instead of two. This makes the mail unambiguously legitimate to a receiving system rather
  # than merely acceptable (data-model E4).
  mail_from_domain = "mail.${var.domain}"
}

resource "aws_sesv2_email_identity" "this" {
  email_identity = var.domain
  tags           = var.tags

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# ── Easy DKIM: three CNAMEs (AWS rotates across them) ─────────────────────────────────────────
resource "aws_route53_record" "dkim" {
  count = 3

  zone_id = var.zone_id
  name    = "${aws_sesv2_email_identity.this.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_sesv2_email_identity.this.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]

  allow_overwrite = true
}

# ── Custom MAIL FROM ──────────────────────────────────────────────────────────────────────────
resource "aws_sesv2_email_identity_mail_from_attributes" "this" {
  email_identity = aws_sesv2_email_identity.this.email_identity

  mail_from_domain = local.mail_from_domain

  # If the MX record ever fails to resolve, fall back to the amazonses.com envelope rather than
  # DROPPING the mail. On a platform where the only credential arrives by email, a degraded send
  # beats a silent non-send.
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

resource "aws_route53_record" "mail_from_mx" {
  zone_id = var.zone_id
  name    = local.mail_from_domain
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${var.region}.amazonses.com"]

  allow_overwrite = true
}

resource "aws_route53_record" "mail_from_spf" {
  zone_id = var.zone_id
  name    = local.mail_from_domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]

  allow_overwrite = true
}

# ── DMARC ─────────────────────────────────────────────────────────────────────────────────────
# p=none by default — see the dmarc_policy variable for why starting at reject is dangerous here.
resource "aws_route53_record" "dmarc" {
  zone_id = var.zone_id
  name    = "_dmarc.${var.domain}"
  type    = "TXT"
  ttl     = 600
  records = ["v=DMARC1; p=${var.dmarc_policy};"]

  allow_overwrite = true
}
