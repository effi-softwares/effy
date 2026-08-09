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
  description = "Amplify framework hint for the branch. Next.js SSR."
  type        = string
  default     = "Next.js - SSR"
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
