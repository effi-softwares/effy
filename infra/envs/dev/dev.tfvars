# dev — the only environment applied now (ap-southeast-1, spec 001-infra-foundation).
# Committed on purpose: nothing here is secret.

env        = "dev"
aws_region = "ap-southeast-1"

# Fill in the real 12-digit account id before the first plan/apply — the placeholder
# fails validation (and the provider allowed_account_ids guard) loudly on purpose.
aws_account_id = "724289623101"

# ESSENTIALS = the passwordless minimum (research.md D4).
user_pool_tier = "ESSENTIALS"

# dev uses the Cognito built-in sender — zero setup, ~50 emails/day cap (research.md D6).
email_configuration = {
  email_sending_account = "COGNITO_DEFAULT"
}

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

# ADD YOUR IP BEFORE APPLY (quickstart Step 1): curl -s https://checkip.amazonaws.com
# [] means NOBODY can connect — the allowlist edit is a deliberate act.
db_allowed_cidrs = ["112.134.236.103/32"] # operator IP, 2026-07-05 — update when your IP changes

# Dev-only posture (002 research.md D4): public endpoint + strict allowlist + forced TLS
# is the $0 network design; qa/staging/prod must use private placement instead.
db_publicly_accessible = true

# Grow-later levers — all at the floor (see quickstart runbook before flipping):
db_multi_az              = false
db_backup_retention_days = 0 # backups OFF: accepted dev risk, data is disposable
db_deletion_protection   = false
db_performance_insights  = false
