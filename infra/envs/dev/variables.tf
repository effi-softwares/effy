variable "env" {
  description = "Environment name — feeds naming, tags, and the SSM path prefix."
  type        = string

  validation {
    condition     = contains(["dev", "qa", "staging", "prod"], var.env)
    error_message = "env must be one of: dev, qa, staging, prod."
  }
}

variable "aws_region" {
  description = "Region all of this env's resources are placed in. The single relocation knob (FR-019/FR-020)."
  type        = string
}

variable "aws_account_id" {
  description = "Target AWS account id (12 digits) — pinned via provider allowed_account_ids (research.md D8)."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be the 12-digit AWS account id — set the real value in this env's .tfvars."
  }
}

variable "user_pool_tier" {
  description = "Cognito feature tier for all four pools. ESSENTIALS is the passwordless minimum; prod may opt up to PLUS via tfvars."
  type        = string
  default     = "ESSENTIALS"
}

variable "email_configuration" {
  description = "OTP email delivery for all four pools. dev: COGNITO_DEFAULT built-in sender. Higher envs switch to SES (DEVELOPER + source_arn) when promoted (research.md D6)."
  type = object({
    email_sending_account  = optional(string, "COGNITO_DEFAULT")
    source_arn             = optional(string)
    from_email_address     = optional(string)
    reply_to_email_address = optional(string)
  })
  default = {}
}

variable "customer_google_enabled" {
  description = <<-EOT
    Google federated sign-in for the CUSTOMER pool. PARKED (false) since 2026-07-14 by operator
    decision.

    false → the customer keeps TWO credential routes: email+password and email OTP. Both are
            pure-SDK and need NO external dependency, so the whole slice can be applied, deployed
            and signed off with nothing outside this repo.
    true  → adds a Cognito hosted domain + the Google identity provider + OAuth on the app client.
            Requires a Google OAuth client (an out-of-code, operator-owned dependency) with its
            id/secret in SSM at /effy/<env>/auth/customer/google_client_{id,secret}.

    ⚠ TURNING THIS ON REQUIRES `customer_pre_sign_up_lambda_arn` IN THE SAME CHANGE. Federation
    without the linking trigger gives a customer who already has an account a SECOND one the first
    time they use Google — and there is NO retroactive merge (AdminLinkProviderForUser requires the
    federated user not to exist yet). The only fix at that point is deleting an account.
  EOT
  type        = bool
  default     = false
}

variable "customer_pre_sign_up_lambda_arn" {
  description = "ARN of the Cognito pre-sign-up ACCOUNT-LINKING trigger (011, apis/edge-api/customer). Null until `make edge-deploy SERVICE=customer` has run once — the Lambda must EXIST before the pool can reference it, so the first apply leaves it null and a second apply wires it. Without the trigger, Google sign-in silently creates a DUPLICATE account for a customer who already has one, and there is no retroactive merge (FR-011)."
  type        = string
  default     = null
}

variable "custom_auth_lambda_arns" {
  description = <<-EOT
    The four 035 sign-in-code trigger ARNs, shared by ALL FOUR pools.

    ⚠ TWO-STAGE, and the order is load-bearing:
      1. apply with this null  → pools exist, still on Cognito's managed 8-digit EMAIL_OTP
      2. make edge-deploy SERVICE=auth ENV=dev
      3. set this in dev.tfvars from the deployed ARNs
      4. apply again  → the pools switch to the platform's 6-digit code
    Cognito validates a trigger on UpdateUserPool, so a not-yet-deployed ARN fails the apply.

    ⚠ SEED THE HMAC SECRET BEFORE STEP 4 (see infra/envs/dev/otp-store.tf). Without it the triggers
    fail closed and NOBODY on the attached pools can sign in.
  EOT
  type = object({
    define              = string
    create              = string
    verify              = string
    post_authentication = string
  })
  default = null
}

variable "custom_message_lambda_arn" {
  description = <<-EOT
    The 038 CustomMessage trigger ARN, shared by ALL FOUR pools — brands Cognito's own sign-up,
    password-reset, email-verification and MFA messages.

    ⚠ TWO-STAGE, same shape as custom_auth_lambda_arns:
      1. apply with this null  → pools keep Cognito's default (unbranded) messages
      2. make edge-deploy SERVICE=auth ENV=dev   (the function is in the auth service, already there)
      3. set this in dev.tfvars from the deployed `customMessage` ARN
      4. apply again  → the four messages switch to the platform design
    Cognito validates a trigger on UpdateUserPool, so a not-yet-deployed ARN fails the apply. Setting
    it is an IN-PLACE update, but read the plan anyway (035 FR-030): a replaced pool destroys accounts.
  EOT
  type        = string
  default     = null
}

variable "mail_postal_address" {
  description = <<-EOT
    Operator-supplied postal address for the email footer (constitution: Real-World Identifiers).

    ⚠ Optional at runtime for transactional mail (CAN-SPAM-exempt) — empty omits the footer line
    rather than shipping a guessed address. It MUST NOT be a placeholder if given; the validation
    below refuses obvious ones. Lifecycle mail (none in this slice) must enforce presence separately.
  EOT
  type        = string
  default     = ""

  validation {
    # ⚠ Empty is allowed (absent, not guessed). A NON-empty value must be real, not a placeholder —
    # a wrong outward-facing value that silently works is worse than an omitted line, because it
    # reaches real people. This is the constitution's "refuse a placeholder" applied to the one
    # real-world identifier this slice prints on every email.
    condition = var.mail_postal_address == "" || !can(regex(
      "(?i)(placeholder|example|todo|xxx|123 (main|test|fake))", var.mail_postal_address
    ))
    error_message = "mail_postal_address looks like a placeholder. Supply the operator's real address, or leave it empty to omit the footer line."
  }
}

variable "auth_urls" {
  description = "Per-audience app-client callback/logout URLs (dev placeholders for now). Keys: customer, driver, shop, back_office."
  type = map(object({
    callback_urls = list(string)
    logout_urls   = list(string)
  }))
  default = {}
}

# --- Database (002-dev-database) — defaults are the cost floor; each is a grow-later lever ---

variable "db_instance_class" {
  description = "RDS instance size lever."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Storage GB (grow-only in RDS)."
  type        = number
  default     = 20
}

variable "db_storage_type" {
  description = "gp3 preferred (research.md 002 D2)."
  type        = string
  default     = "gp3"
}

variable "db_allowed_cidrs" {
  description = "Operator /32 allowlist for port 5432. [] = nobody can connect."
  type        = list(string)
  default     = []
}

variable "db_multi_az" {
  description = "Durability lever (~2x instance cost)."
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  description = "0 = automated backups OFF (dev accepted risk); promotion sets 7+."
  type        = number
  default     = 0
}

variable "db_deletion_protection" {
  description = "Flip true before an env holds real data."
  type        = bool
  default     = false
}

variable "db_performance_insights" {
  description = "Paid observability lever; false = free floor."
  type        = bool
  default     = false
}

variable "db_publicly_accessible" {
  description = "true is the documented DEV-ONLY allowlisted-public posture (002 research.md D4); qa+ must stay false."
  type        = bool
  default     = false
}

variable "db_allow_public_ingress" {
  description = "DEV-ONLY (002 FR-006, amended 2026-07-12). false = 0.0.0.0/0 in db_allowed_cidrs is REJECTED, so a public database cannot be created by accident. dev sets true because the edge-api Lambdas run outside the VPC and egress from unpinnable AWS IPs. NEVER true where real data lives."
  type        = bool
  default     = false
}

# --- Domain & DNS (010-domain-dns-foundation) ---

variable "root_domain" {
  description = "The platform's registered domain. This env's namespace is <env>.<root_domain>; the parent zone is owned by infra/global/ and looked up by name."
  type        = string
  default     = "effyshopping.com"
}

variable "api_subdomain" {
  description = "Single label for the shared COLD-PATH API under this env's namespace → edge-api.dev.effyshopping.com. Named for the path it fronts, not generically: the hot path (core-api) gets its own name when it deploys, and a bare `api` would have quietly claimed the shared word for one of two backends. MUST stay one label — the wildcard certificate matches exactly one (010 research R3)."
  type        = string
  default     = "edge-api"
}

variable "dmarc_rua" {
  description = "Address receiving this namespace's DMARC aggregate reports (037 FR-017). Without it, monitor mode collects nothing and there is never evidence on which to tighten the policy."
  type        = string
  default     = "mailto:dmarc@effyshopping.com"
}

# ── Hot-path (core-api) cloud deployment (040) ──────────────────────────────────────────────
# The prod promotion knobs. Producing core-api.effyshopping.com is these values changed, not
# code (spec FR-014 / SC-003). See data-model.md § Production delta and core-api.tf's comment.

variable "core_api_subdomain" {
  description = "Single label for the HOT-PATH API under this env's namespace → core-api.dev.effyshopping.com. Its own name, distinct from api_subdomain (the cold path). MUST stay one label — the wildcard certificate matches exactly one (010 research R3)."
  type        = string
  default     = "core-api"
}

variable "core_api_image_tag" {
  description = "Image tag core-api runs. dev: latest (mutable, force-new-deployment picks it up); prod: an immutable git-sha."
  type        = string
  default     = "latest"
}

variable "core_api_cpu" {
  description = "Fargate task CPU units. 256 = 0.25 vCPU, the cheapest (no autoscaling)."
  type        = number
  default     = 256
}

variable "core_api_memory" {
  description = "Fargate task memory (MiB). 512 is the smallest valid pairing with 256 CPU."
  type        = number
  default     = 512
}

variable "core_api_desired_count" {
  description = "Number of running tasks. FIXED at 1 (cheapest); there is NO autoscaling."
  type        = number
  default     = 1
}

variable "core_api_cors_origins" {
  description = "Browser origins allowed to call the hot path (customer-web). Native mobile + SSR need no CORS. The deployed storefront origin is added here per env; localhost:3000 covers local dev."
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "core_api_assign_public_ip" {
  description = "DEV-ONLY: true = the task runs in PUBLIC subnets with a public IP and egresses with NO NAT (the cheapest posture, matching the dev DB's public endpoint). ⚠ NEVER true where real data lives — prod uses private subnets (false) + a NAT/endpoints."
  type        = bool
  default     = true
}

variable "core_api_subnet_ids" {
  description = "Subnets for the ALB + task. [] = the module resolves the DEFAULT VPC's public subnets (dev). Prod supplies PRIVATE subnet ids here."
  type        = list(string)
  default     = []
}

variable "alert_email" {
  description = <<-EOT
    Address every operator alarm notifies (037 FR-037). OPERATOR-SUPPLIED — empty means the topic is
    created with no subscriber, which is the correct state until someone chooses an address.

    ⚠ AWS sends a confirmation link on first apply, and the subscription notifies NOBODY until a
    human clicks it — while `terraform apply` reports success either way.
  EOT
  type        = string
  default     = ""

  validation {
    condition     = var.alert_email == "" || can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be empty or a single email address."
  }

  # ⚠ MECHANICAL ENFORCEMENT of the constitution's Real-World Identifiers rule (v1.12.0).
  #
  # The address that was applied here by mistake belongs to an assistant session, not to this
  # platform. A rule that lives only in a document is a rule that gets broken again.
  #
  # ⚠ SCOPED TO THE WHOLE DOMAIN, NOT ONE ADDRESS. The first version of this block compared against
  # a single literal — and `anything@sub.phantm.com` sailed straight through it. Banning one address
  # while leaving its domain open is the shape of a guard that looks like enforcement and is not.
  validation {
    condition     = !can(regex("(?i)phantm\\.com$", var.alert_email))
    error_message = "PROHIBITED: no phantm.com address (or any subdomain of it) may be used in this project — constitution v1.12.0, Real-World Identifiers. Approved Effy mailboxes: workspace-admin@effyshopping.com (operational), hello@effyshopping.com (customer-facing). Anything else: ask the operator."
  }
}

variable "ses_suppressed_reasons" {
  description = <<-EOT
    Which outcomes add an address to — and block it from — the ACCOUNT-WIDE suppression list, for
    mail sent through this environment's configuration set (037 FR-041).

    ⚠ [] IN NON-PRODUCTION, and not for convenience: the account-level list is account-wide and
    region-wide, so a mistyped address in dev would otherwise make that real person unreachable in
    PRODUCTION, with no warning and no visible relationship between the two events.

    Production keeps the default ["BOUNCE","COMPLAINT"] — there, suppression is protection.
  EOT
  type        = list(string)
  default     = ["BOUNCE", "COMPLAINT"]
}

variable "ses_sender_enabled" {
  description = "Flip to true ONLY after the SES domain identity reports VERIFIED (`make mail-verify ENV=dev`). Cognito REJECTS a source_arn whose identity is unverified, and verification is asynchronous — it completes minutes after the apply that creates the DKIM records returns. false = the four pools stay on the Cognito built-in sender; true = they send as no-reply@<env>.<root_domain>. This flag is the gate made explicit (010 tasks T028a)."
  type        = bool
  default     = false
}

# ── The storefront's contract (042) ─────────────────────────────────────────────────────────────

variable "storefront_base_url" {
  description = "Public origin of the customer storefront (no trailing slash). The back office posts cache invalidations here on publish, and 039's newsletter composes its confirm link from it."
  type        = string

  validation {
    # ⚠ Refuses a placeholder rather than accepting one. A wrong outward-facing address that silently
    # "works" is worse than a build that stops: publishes would report success while every shopper
    # kept seeing the old page, and a newsletter confirm link would point somewhere nobody can reach.
    condition     = can(regex("^https?://[^/]+$", var.storefront_base_url))
    error_message = "storefront_base_url must be a full origin with no trailing slash, e.g. https://dev.effyshopping.com — set the real value in this env's .tfvars."
  }
}

# ⚠ There is deliberately NO `revalidate_secret` variable. The bearer's VALUE is seeded by the
# operator directly into Secrets Manager (see web.tf) — a Terraform variable would carry it into
# state, and `dev.tfvars` is committed on the stated premise that nothing in it is secret.
