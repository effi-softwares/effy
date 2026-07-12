# Edge network — INTENTIONALLY EMPTY (dev posture, revised 2026-07-12).
#
# History, so nobody re-adds this by accident:
#
# 004 (amendment A1) placed the edge-api Lambdas INSIDE the default VPC, because an
# out-of-VPC Lambda egresses from arbitrary AWS IPs and the dev DB's operator-IP allowlist
# (002's cost-floor posture) rightly refused them. That worked, but it bought a problem: an
# in-VPC Lambda has NO internet path without a NAT gateway. Public subnets do not help — an
# internet gateway only translates for resources that have a public IP, and Lambda ENIs never
# get one. So every public AWS API call had to be given its own interface endpoint. 004 added
# one for Secrets Manager and noted that Cognito was only ever resolved at DEPLOY time.
#
# 009 broke that assumption: shop-management provisions shop-pool users by calling Cognito
# (AdminCreateUser) AT RUNTIME. With no NAT and no Cognito endpoint, that call did not fail —
# it HUNG to the 10s Lambda timeout, surfacing as a bare 500 with no log line. Fixing it in
# place meant a second interface endpoint (~$9/mo), and every future AWS API the handlers touch
# would need yet another.
#
# Decision (dev): take the Lambdas OUT of the VPC instead. Outside the VPC they have ordinary
# internet egress, so Cognito, Secrets Manager, and anything else work for $0 — and BOTH
# interface endpoints (~$18/mo) are deleted rather than multiplied. The Lambdas then reach the
# database over its PUBLIC endpoint, which is why dev sets `db_allowed_cidrs = ["0.0.0.0/0"]`.
#
# ⚠️ THE TRADE, STATED PLAINLY: the dev database is exposed to the internet on 5432, defended
# only by forced TLS (`rds.force_ssl = 1`) and the RDS-managed 32-character master password.
# Public Postgres is found by scanners within hours and brute-forced continuously. This is
# accepted ONLY because dev holds disposable data (backups are off; the whole env was destroyed
# and rebuilt on 2026-07-12 with nothing kept).
#
# THIS IS NOT A VALID POSTURE FOR qa / staging / prod. Those environments must place the DB in
# private subnets with `db_publicly_accessible = false` and give the functions a private path
# back (in-VPC + endpoints, or RDS Proxy) — tracked as debt in infra/envs/README.md. Promotion
# is the forcing function: see the promotion checklist there before applying any higher env.
#
# Removed here: aws_security_group.edge_lambda / .edge_vpce, their rules, the SG-to-SG DB
# ingress, aws_vpc_endpoint.secretsmanager / .cognito_idp, and the two SSM contract parameters
# /effy/<env>/edge/{security_group_id,subnet_ids} (no longer read by any serverless.yml).
