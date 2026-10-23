# Edge network: intentionally empty. The edge Lambdas run outside the VPC, so Cognito, Secrets Manager and
# every other AWS API are reachable with no NAT gateway or interface endpoints (an in-VPC Lambda has no
# internet path without NAT, and each endpoint costs ~$9/month). They reach the database over its public
# endpoint, so dev sets `db_allowed_cidrs = ["0.0.0.0/0"]`.
#
# The trade: the dev database is open on 5432, defended only by forced TLS (`rds.force_ssl = 1`) and the
# RDS-managed 32-character master password. Accepted only because dev holds disposable data (backups are
# off). Not valid for qa / staging / prod: those place the database in private subnets with
# `db_publicly_accessible = false` and give the functions a private path (in-VPC + endpoints, or RDS
# Proxy); see the promotion checklist in infra/envs/README.md.
