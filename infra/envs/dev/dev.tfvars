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
#
# ⚠ FLIPPED TO true BY 037 (FR-002/FR-007). Until now the four pools were still on the Cognito
# built-in sender: a generic third-party from-address AND a ~50-messages-per-day-per-pool ceiling on
# sign-up confirmation, password recovery, email-change and both step-up codes. That cap — not the
# SES sandbox, which was lifted before 037 began — was the platform's real onboarding ceiling.
ses_sender_enabled = true

# --- Email delivery (037-platform-email-delivery) ---

# Every operator alarm notifies here. ⚠ Confirm the subscription email AWS sends on first apply —
# until someone clicks it the alarms notify nobody, and the apply succeeds regardless.
alert_email = "techsupport+claudeone@phantm.com"

# ⚠ [] CANCELS SUPPRESSION FOR THIS ENVIRONMENT — deliberately (FR-041).
# The account-level block list is account-wide AND region-wide. Left at the default, one mistyped
# address in dev would permanently block that person in PRODUCTION too. The cost is that dev keeps
# sending to genuinely dead addresses and each attempt counts toward the shared bounce rate; that is
# survivable only because 037 now RECORDS every such failure instead of absorbing it.
#
# ⚠ VERIFY AFTER APPLY — the provider's update path may not send this the way the plan implies:
#   aws sesv2 get-configuration-set --configuration-set-name effy-dev-mail --query 'SuppressionOptions'
#   {"SuppressedReasons": []} → active.   null → INHERITING, and FR-041 is NOT met.
ses_suppressed_reasons = []

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
  # 011: these two were SWAPPED — shop-web runs on :5174 and back-office on :5173. Inert until
  # now (neither pool had an OAuth flow), but 011 turns OAuth on for the first time, so the latent
  # error is corrected before it can become a live one.
  shop = {
    callback_urls = ["http://localhost:5174/auth/callback", "effy-shop://auth/callback"]
    logout_urls   = ["http://localhost:5174/", "effy-shop://signed-out"]
  }
  back_office = {
    callback_urls = ["http://localhost:5173/auth/callback"]
    logout_urls   = ["http://localhost:5173/"]
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

# 035 — the sign-in code triggers. Setting this is THE CUTOVER: it attaches the
# triggers AND flips every client to ALLOW_CUSTOM_AUTH. Removing it is the rollback.
custom_auth_lambda_arns = {
  define              = "arn:aws:lambda:ap-southeast-2:724289623101:function:effy-edge-auth-dev-defineAuthChallenge"
  create              = "arn:aws:lambda:ap-southeast-2:724289623101:function:effy-edge-auth-dev-createAuthChallenge"
  verify              = "arn:aws:lambda:ap-southeast-2:724289623101:function:effy-edge-auth-dev-verifyAuthChallenge"
  post_authentication = "arn:aws:lambda:ap-southeast-2:724289623101:function:effy-edge-auth-dev-postAuthentication"
}
