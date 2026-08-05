# The platform's parent hosted zone — effyshopping.com.
#
# WHY THIS LIVES IN ITS OWN ROOT (010 research R1 — the load-bearing decision of the slice):
# env roots are DESIGNED to be destroyable. `make destroy ENV=dev` is a supported operation and was
# actually used during the 2026-07-12 region relocation. If this zone lived in infra/envs/dev, that
# routine command would destroy the platform's apex — every record under it, production's future
# delegation, and the name-servers GoDaddy points at. A re-created zone gets NEW name-servers, so
# recovery would require a manual registrar repoint plus a fresh propagation wait.
#
# ⚠ DO NOT DESTROY THIS ROOT CASUALLY. It is not an environment and is not in the ENV= workflow.
#
# Environments do NOT get their delegation record from here. Each env root creates its own child
# zone AND writes its own NS record into this zone (see modules/dns-env-zone). That keeps the
# delegation in the ENV's state, so destroying an env removes the delegation and the zone it points
# at together — no dangling delegation, no subdomain takeover (spec FR-005).

resource "aws_route53_zone" "parent" {
  name    = var.root_domain
  comment = "Effy platform apex — production namespace. Children are delegated per environment (010)."
}

# =================================================================================================
# The apex's MAIL identity (037-platform-email-delivery).
#
# The apex sends no automated mail — the environments do, from their own namespaces. What it does is
# host the operator's human mailbox (workspace-admin@, with hello@ and support@ as aliases) and
# publish the policy that stops anyone forging Effy's name.
#
# ⚠ ORDER IS LOAD-BEARING AND THE FAILURE IS SILENT (FR-021). Authorisation (SPF) and signing (DKIM)
# must be live and verified BEFORE the alignment policy below. Reversed, the policy Effy publishes
# to protect its own brand quarantines Effy's own support replies — and nothing on our side reports
# it. You find out from a customer who never got an answer. The quickstart stages this as two
# separate applies for exactly that reason.
# =================================================================================================

# ── Inbound: adopted, never re-created ────────────────────────────────────────────────────────
# ⚠ THIS RECORD IS LIVE AND LOAD-BEARING. It is the only route to the company's mailbox. It is
# ADOPTED via imports.tf, and its value is declared here to match what is already published — if a
# plan ever shows this changing or being replaced, something is wrong with the declaration, not with
# the live record. Verify inbound before AND after every apply against this zone (SC-022):
#     dig +short MX effyshopping.com @8.8.8.8   →   1 smtp.google.com.
resource "aws_route53_record" "apex_mx" {
  zone_id = aws_route53_zone.parent.zone_id
  name    = var.root_domain
  type    = "MX"
  ttl     = 3600
  records = ["1 SMTP.GOOGLE.COM."]
}

# ── Outbound: who may send as this domain, and the proof of ownership ─────────────────────────
#
# ⚠ ONE RECORD SET, TWO STRINGS. Route 53 holds one record set per (name, type), so the ownership
# proof and the sender policy MUST live in one resource as two `records` elements. Two separate
# `aws_route53_record` resources with this name and type would fight over one record set and the
# second apply would clobber the first.
#
# ⚠ TWO SEPARATE TXT RECORDS AT ONE NAME IS FINE — TWO SPF STRINGS IS NOT.
# RFC 7208 §4.5: a verifier first DISCARDS every record that does not begin `v=spf1`, then fails
# permanently if more than one remains. So the ownership proof sitting beside the policy is
# harmless — it is discarded. But a SECOND `v=spf1` string here would make sender-policy evaluation
# fail permanently for EVERY message from this domain, including mail that works today.
#
# ⚠ SO: ADDING A FUTURE SENDER MEANS EDITING THE EXISTING STRING (another `include:`), NEVER ADDING
# A SECOND ONE. This is the single most common way a working domain's mail is broken.
#
# Lookup budget: `include:_spf.google.com` costs 1 of the 10 permitted DNS lookups — Google
# flattened its record in December 2025, so the old nested _netblocks chain no longer applies.
# The environments' own sending is authorised in THEIR namespaces, not here; SES is deliberately
# not authorised to send as the apex, because nothing does.
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

# ── Signing for the human mailbox ─────────────────────────────────────────────────────────────
#
# ⚠ WITHOUT THIS, EVERY REPLY EFFY SENDS FAILS AUTHENTICATION. The mailbox could receive but not
# legitimately send: nothing authorised it and nothing signed it, so mail from hello@ failed both
# checks at Gmail and Outlook. The mailbox that exists to build trust was the least trustworthy
# sender the platform had.
#
# ⚠ THE 255-CHARACTER SPLIT IS THE DANGEROUS PART.
# A single DNS character-string caps at 255 characters; this value is ~410. The split below produces
# ONE record containing TWO character-strings, which resolvers concatenate WITHOUT adding spaces.
#
# Writing `records = [first, second]` instead would produce TWO SEPARATE TXT RECORDS — valid DNS, and
# a silently broken key, because a verifier then sees two records neither of which is a complete
# signing key. Nothing errors. Signatures simply never verify.
#
# Verify after apply — expect ONE record rendered as two adjacent quoted strings:
#     dig +short TXT google._domainkey.effyshopping.com @8.8.8.8
# and `make mail-verify ENV=dev`, which reassembles it and compares byte-for-byte against
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

# ── The anti-forgery policy — LAST (FR-014) ───────────────────────────────────────────────────
#
# ⚠ DO NOT APPLY THIS BEFORE THE TWO RECORDS ABOVE ARE LIVE AND VERIFIED. See the header.
#
# `sp=none` is deliberate: it stops any future environment namespace that has not yet published its
# own policy from silently inheriting enforcement before it is ready. Each environment publishes its
# own record (modules/ses-domain-identity), and a receiver queries the sender's own domain FIRST —
# falling back to the organisational domain only when it finds nothing. That is what lets this apex
# tighten to quarantine or reject later while an environment is still in monitor mode.
#
# `rua` is what makes monitor mode mean anything. Without aggregate reports there is no evidence
# that legitimate mail aligns, and therefore no basis on which to ever tighten `p` (FR-017).
# ⚠ The rua address must EXIST — an alias on the operator's mailbox — or the reports land nowhere and
# `p=none` becomes permanent by default.
resource "aws_route53_record" "apex_dmarc" {
  zone_id = aws_route53_zone.parent.zone_id
  name    = "_dmarc.${var.root_domain}"
  type    = "TXT"
  ttl     = 3600

  records = ["v=DMARC1; p=${var.dmarc_policy}; sp=none; rua=${var.dmarc_rua}; fo=1"]
}
