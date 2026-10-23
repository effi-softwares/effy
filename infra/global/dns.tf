# The platform's parent hosted zone, effyshopping.com, in its own root because env roots are destroyable:
# in infra/envs/dev, `make destroy ENV=dev` would take the apex with it, and a re-created zone gets new
# name-servers (a manual GoDaddy repoint). Not in the ENV= workflow; do not destroy it casually.
#
# Environments write their own delegation record into this zone from their own state
# (modules/dns-env-zone), so destroying an env removes its delegation and zone together.

resource "aws_route53_zone" "parent" {
  name    = var.root_domain
  comment = "Effy platform apex — production namespace. Children are delegated per environment (010)."
}

# =================================================================================================
# The apex's mail identity. The apex sends no automated mail (the environments send from their own
# namespaces); it hosts the operator's mailbox (workspace-admin@, with hello@ and support@ as aliases) and
# publishes the policy that stops anyone forging Effy's name.
#
# Order matters and the failure is silent: SPF and DKIM must be live and verified before the alignment
# policy, or Effy's own replies are quarantined. Two separate applies.
# =================================================================================================

# ── Inbound: adopted, never re-created ────────────────────────────────────────────────────────
# this record is live and load-bearing. It is the only route to the company's mailbox. It is
# adopted via imports.tf, and its value is declared here to match what is already published — if a
# plan ever shows this changing or being replaced, something is wrong with the declaration, not with
# the live record. Verify inbound before and after every apply against this zone:
# dig +short MX effyshopping.com @8.8.8.8 → 1 smtp.google.com.
resource "aws_route53_record" "apex_mx" {
  zone_id = aws_route53_zone.parent.zone_id
  name    = var.root_domain
  type    = "MX"
  ttl     = 3600
  records = ["1 SMTP.GOOGLE.COM."]
}

# Outbound: who may send as this domain, and the proof of ownership, as two strings in one record set
# (Route 53 has one per name and type; two resources would clobber each other). A TXT beside the SPF string
# is fine (RFC 7208 §4.5 discards non-`v=spf1` records), but a second `v=spf1` string fails SPF permanently:
# add a sender by editing the existing string (another `include:`).
#
# `include:_spf.google.com` costs 1 of the 10 DNS lookups. SES is not authorised for the apex: nothing sends
# as it.
resource "aws_route53_record" "apex_txt" {
  zone_id = aws_route53_zone.parent.zone_id
  name    = var.root_domain
  type    = "TXT"
  ttl     = 3600

  records = [
    "v=spf1 include:_spf.google.com ~all",
    "google-site-verification=5sG_ebnLikgdvMrA5l0szjm7yUM_be34osIkkk2z-3E",
  ]
}

# DKIM for the mailbox, so replies from hello@ authenticate. The value (~410 characters) exceeds one DNS
# character-string (255), so it is split into two strings in one record, which resolvers concatenate.
# `records = [first, second]` would make two records, neither a complete key, and signatures would never
# verify.
#
# Verify after apply — expect one record rendered as two adjacent quoted strings:
# dig +short TXT google._domainkey.effyshopping.com @8.8.8.8
# and `make mail-verify ENV=dev`, which reassembles it and compares byte for byte against
# specs/037-platform-email-delivery/operator-inputs.md.
resource "aws_route53_record" "workspace_dkim" {
  zone_id = aws_route53_zone.parent.zone_id
  name    = "google._domainkey.${var.root_domain}"
  type    = "TXT"
  ttl     = 3600

  records = [
    length(var.workspace_dkim_public_key) <= 255
    ? var.workspace_dkim_public_key
    : format(
      "%s\" \"%s",
      substr(var.workspace_dkim_public_key, 0, 255),
      substr(var.workspace_dkim_public_key, 255, length(var.workspace_dkim_public_key) - 255),
    )
  ]
}

# ── The anti-forgery policy — last ───────────────────────────────────────────────────
#
# do not apply this before the two records above are live and verified. See the header.
#
# `sp=none` is deliberate: it stops any future environment namespace that has not yet published its
# own policy from silently inheriting enforcement before it is ready. Each environment publishes its
# own record (modules/ses-domain-identity), and a receiver queries the sender's own domain first
# falling back to the organisational domain only when it finds nothing. That is what lets this apex
# tighten to quarantine or reject later while an environment is still in monitor mode.
#
# `rua` is what makes monitor mode mean anything. Without aggregate reports there is no evidence
# that legitimate mail aligns, and therefore no basis on which to ever tighten `p`.
# The rua address must exist — an alias on the operator's mailbox — or the reports land nowhere and
# `p=none` becomes permanent by default.
resource "aws_route53_record" "apex_dmarc" {
  zone_id = aws_route53_zone.parent.zone_id
  name    = "_dmarc.${var.root_domain}"
  type    = "TXT"
  ttl     = 3600

  records = ["v=DMARC1; p=${var.dmarc_policy}; sp=none; rua=${var.dmarc_rua}; fo=1"]
}
