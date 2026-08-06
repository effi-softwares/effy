# ⚠ ADOPTING THE TWO RECORDS THAT WERE ADDED BY HAND (037 FR-024).
#
# The apex's mail-exchanger record and the mail service's domain-ownership proof were created in a
# provider console, not by Terraform. This root previously declared the ZONE and nothing else, so the
# platform's single source of truth did not know they existed.
#
# ⚠ WHY THIS FILE MUST BE APPLIED BEFORE ANYTHING ELSE TOUCHES THOSE NAMES:
# Route 53 holds ONE record set per (name, type). Declaring a second `aws_route53_record` for the
# same name and type does not merge with the console entry — the apply CLOBBERS it. The
# mail-exchanger record is the only route to workspace-admin@ and its hello@ / support@ aliases, and
# it is working RIGHT NOW. Losing it silently stops all inbound mail to the company.
#
# The apex TXT is the same hazard in a subtler form: the ownership proof and the new sender-policy
# string share one record set, so they are two STRINGS in one resource — never two resources.
#
# ⚠ EXPECT A CLEAN PLAN. After `terraform plan`, this must read:
#     Plan: 0 to add, 0 to change, 0 to destroy.  2 to import.
# A non-empty change count means the declared value does not match what is live — STOP, do not
# apply, and reconcile. The usual cause is TXT quoting: the HCL string holds the record's CONTENT,
# never its outer quotes.
#
# These blocks are inert once applied and are kept as documentation of provenance.

import {
  to = aws_route53_record.apex_mx
  identity = {
    zone_id = aws_route53_zone.parent.zone_id
    name    = var.root_domain
    type    = "MX"
  }
}

import {
  to = aws_route53_record.apex_txt
  identity = {
    zone_id = aws_route53_zone.parent.zone_id
    name    = var.root_domain
    type    = "TXT"
  }
}
