# Reusable Amplify Hosting web app (042-customer-web-cicd).
#
# Every environment-specific value is a variable — no `dev` / `dev.effyshopping.com` literal appears
# in this module's logic (FR-018). Production is a second instantiation with different values
# (FR-019): domain_name = "effyshopping.com", deploy_branch = the production release branch.

variable "name" {
  description = "Full resource name for the Amplify app, e.g. effy-dev-customer-web."
  type        = string
}

variable "repository_url" {
  description = "HTTPS URL of the Git repository Amplify connects to (e.g. https://github.com/effi-softwares/effy)."
  type        = string
}

variable "access_token" {
  description = <<-EOT
    Git provider access token authorizing Amplify to read the repo + create a webhook and deploy key.
    Operator-supplied via SSM SecureString (constitution: Real-World Identifiers) and passed in by the
    env root. Amplify uses it once to set up the connection and does not persist it. NEVER hardcode.
  EOT
  type        = string
  sensitive   = true
}

variable "deploy_branch" {
  description = "The repository branch that auto-deploys this environment (dev: dev; prod: the production release branch). A variable, never a literal in logic (FR-018)."
  type        = string
}

variable "app_root" {
  description = "Path (repo-relative) of the app within the monorepo. Set as AMPLIFY_MONOREPO_APP_ROOT and MUST equal the amplify.yml appRoot, or the build fails (research D2)."
  type        = string
  default     = "apps/customer-web"
}

variable "framework" {
  description = "Amplify framework hint for the branch. Next.js SSR (storefront) or Web (Vite SPA consoles, 048)."
  type        = string
  default     = "Next.js - SSR"
}

variable "platform" {
  description = <<-EOT
    Amplify app platform. Default WEB_COMPUTE (Next SSR, 042). The Vite SPA consoles (048) pass "WEB"
    (static): a static app has no server runtime, so the module creates NO service role and sets no
    iam_service_role_arn — 042's "Unable to assume specified IAM Role at CreateApp" hazard is a
    WEB_COMPUTE-only concern and cannot arise for WEB (research D2).
  EOT
  type        = string
  default     = "WEB_COMPUTE"

  validation {
    condition     = contains(["WEB", "WEB_COMPUTE"], var.platform)
    error_message = "platform must be WEB (static SPA) or WEB_COMPUTE (SSR)."
  }
}

variable "subdomain_prefix" {
  description = <<-EOT
    Label the app is served under within domain_name. "" = the zone apex (storefront, 042). The
    consoles (048) pass "shop" / "back-office" → shop.<domain_name> / back-office.<domain_name>. A
    variable, never a literal (FR-010/FR-020, research D4).
  EOT
  type        = string
  default     = ""
}

variable "custom_rules" {
  description = <<-EOT
    Amplify custom rewrite/redirect rules on the app. Default [] (the storefront needs none — Next
    routes server-side). A Vite SPA (048) passes the single-page-app rewrite (unknown non-asset path →
    /index.html, status 200) so client-side deep links survive a refresh (FR-011, research D3).
  EOT
  type = list(object({
    source = string
    target = string
    status = string
  }))
  default = []
}

variable "stage" {
  description = "Informational Amplify branch stage: DEVELOPMENT / PRODUCTION / etc."
  type        = string
  default     = "DEVELOPMENT"
}

variable "env_vars" {
  description = <<-EOT
    Build + runtime environment variables for the Amplify app. NEXT_PUBLIC_* values are inlined into
    the browser bundle at build and MUST be public-safe (FR-016); server-only values (no NEXT_PUBLIC_
    prefix) reach only the SSR runtime. AMPLIFY_MONOREPO_APP_ROOT is added automatically from app_root.
  EOT
  type        = map(string)
  default     = {}
}

variable "domain_name" {
  description = "Custom domain to serve the app at (dev: dev.effyshopping.com; prod: effyshopping.com). Empty disables the domain association (e.g. stage-A apply before cutover)."
  type        = string
  default     = ""
}

variable "enable_www" {
  description = "Also map the www.<domain_name> subdomain (redirecting to the apex). FR-010."
  type        = bool
  default     = true
}

variable "service_role_arn" {
  description = <<-EOT
    ARN of the Amplify service role (the SSR CloudWatch Logs role) the app assumes to build/run.

    ⚠ Leave "" to have this module create the role. BUT: Amplify's build orchestrator frequently
    CANNOT assume a role created outside Amplify's own flow — the build then fails at step 0 with
    "Unable to assume specified IAM Role" (a well-documented IaC edge case). The reliable path is to
    let Amplify AUTO-CREATE the role once (Amplify console → App settings → IAM roles → create/use a
    new service role), then paste that ARN here so Terraform references it and never fights it.
    Prod does the same one-time console step and pins its ARN.
  EOT
  type        = string
  default     = ""
}

variable "enable_auto_build" {
  description = "Auto-build + deploy on every push to deploy_branch (FR-001). Off only for a paused surface."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Extra tags. The provider's default_tags already cover the base set."
  type        = map(string)
  default     = {}
}
