# dev — the only environment applied now (ap-southeast-2, spec 001-infra-foundation).
# Committed on purpose: nothing here is secret.

env        = "dev"
aws_region = "ap-southeast-2"

# Fill in the real 12-digit account id before the first plan/apply — the placeholder
# fails validation (and the provider allowed_account_ids guard) loudly on purpose.
aws_account_id = "724289623101"

# ESSENTIALS = the passwordless minimum (research.md D4).
user_pool_tier = "ESSENTIALS"

# The FALLBACK sender, used whenever ses_sender_enabled = false: Cognito's built-in sender — zero
# setup, ~50 emails/day cap, generic AWS from-address (001 research D6).
email_configuration = {
  email_sending_account = "COGNITO_DEFAULT"
}

# --- Domain & DNS (010-domain-dns-foundation) ---

# ⚠ TWO-STAGE. Leave this false for the FIRST apply: it creates the SES identity and its DKIM/SPF/
# DMARC records, but AWS verifies them ASYNCHRONOUSLY — minutes after the apply returns. Cognito
# REJECTS a source_arn whose identity is not yet verified, so switching the pools in the same apply
# fails.
#
# Sequence: apply (false) → `make mail-verify ENV=dev` reports verified → set this true → apply
# again. The second apply switches all four pools to no-reply@dev.effyshopping.com IN PLACE.
#
# ⚠ On that second apply: ABORT if any Cognito pool shows "must be replaced" / "-/+". A replaced
# pool destroys every account in it — the 006 first admin and the 009 shop users included.
ses_sender_enabled = false

# Placeholder dev URLs — inert until an OAuth flow is enabled; the Amplify choice-based
# EMAIL_OTP flow talks to Cognito directly and does not use them (data-model.md E4).
auth_urls = {
  customer = {
    callback_urls = ["http://localhost:3000/auth/callback", "effy-customer://auth/callback"]
    logout_urls   = ["http://localhost:3000/", "effy-customer://signed-out"]
  }
  driver = {
    callback_urls = ["effy-driver://auth/callback"]
    logout_urls   = ["effy-driver://signed-out"]
  }
  shop = {
    callback_urls = ["http://localhost:5173/auth/callback", "effy-shop://auth/callback"]
    logout_urls   = ["http://localhost:5173/", "effy-shop://signed-out"]
  }
  back_office = {
    callback_urls = ["http://localhost:5174/auth/callback"]
    logout_urls   = ["http://localhost:5174/"]
  }
}

# --- Database (002-dev-database): the cost floor — ≈ US$22/mo, every paid extra OFF ---

db_instance_class    = "db.t4g.micro"
db_allocated_storage = 20
db_storage_type      = "gp3"

# ⚠️ OPEN TO THE INTERNET — a deliberate DEV-ONLY choice (2026-07-12), not an oversight.
# The edge-api Lambdas run OUTSIDE the VPC (see edge-network.tf) so they egress from arbitrary,
# unpinnable AWS IPs and no allowlist can admit them. Rather than pay ~$18/mo in interface
# endpoints to keep them inside the VPC, dev exposes the DB and accepts the risk: the data is
# disposable (backups off; the env was destroyed and rebuilt on 2026-07-12 keeping nothing), and
# the defences are forced TLS (rds.force_ssl=1) + the RDS-managed 32-char master password.
#
# Public Postgres IS scanned and brute-forced continuously — this is a real exposure, accepted
# only because the blast radius is a throwaway dev box.
#
# qa/staging/prod MUST NOT copy this: db_publicly_accessible = false, DB in private subnets, and
# a private path back for the functions. Tracked as debt in infra/envs/README.md.
db_allowed_cidrs = ["0.0.0.0/0"] # DEV ONLY — public Postgres; see the note above

# The conscious opt-in that unlocks 0.0.0.0/0 above (002 FR-006, amended 2026-07-12). Without
# this the module REJECTS the plan — the guard is intact, the exception is just named. Leave this
# false (its default) in every other environment.
db_allow_public_ingress = true

# Dev-only posture (002 research.md D4): public endpoint + strict allowlist + forced TLS
# is the $0 network design; qa/staging/prod must use private placement instead.
db_publicly_accessible = true

# Grow-later levers — all at the floor (see quickstart runbook before flipping):
db_multi_az              = false
db_backup_retention_days = 0 # backups OFF: accepted dev risk, data is disposable
db_deletion_protection   = false
db_performance_insights  = false
