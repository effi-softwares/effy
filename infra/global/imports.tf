# Adopts the two records created by hand: the apex MX (the only route to workspace-admin@ and its aliases)
# and the mail service's ownership proof. Route 53 has one record set per (name, type), so a second
# resource for the same name would clobber the live record. The apex TXT holds the ownership proof and the
# SPF string as two strings in one resource.
#
# Expect a clean plan:
# Plan: 0 to add, 0 to change, 0 to destroy. 2 to import.
# Any change means the declared value differs from what is live (usually TXT quoting: the HCL string is the
# content, never its outer quotes): stop and reconcile. Inert once applied.

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
