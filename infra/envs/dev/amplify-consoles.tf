# Internal console continuous deployment: shop-web (shop pool) and back-office (admin pool), static Vite
# SPAs on Amplify Hosting's monorepo pipeline (platform = "WEB", no SSR role), on this env's `shop.` and
# `back-office.` subdomains. amplify.yml declares one application per surface, and each Amplify app builds
# only the entry matching its AMPLIFY_MONOREPO_APP_ROOT, so a console never builds another surface.
#
# Operator prerequisite: the Amplify→GitHub token (data.aws_ssm_parameter.amplify_github_token, in
# amplify-customer-web.tf). The consoles carry no secret: every VITE_* value is public-safe.

locals {
  # two addresses since 075 - one per gateway, one backend behind both.
  # shop-web → the shared gateway: /shop/v1/*, /inventory/v1/* (its own stock routes).
  # back-office → the staff gateway: /admin, /orders, /fleet, /catalog, /inventory/v1/admin.
  # Paths did not change in the move; only back-office's base address did.
  shop_web_api_base_url = local.api_url # https://edge-api.dev.effyshopping.com

  back_office_api_base_url = local.staff_api_url # https://staff-api.dev.effyshopping.com

  # SPA rewrite: any path that is not a static asset → /index.html with 200 (a rewrite, so deep links survive).
  # The extension allow-list must include every asset type served: `webmanifest` missing once returned the
  # app shell as the manifest, so the console silently could not be installed (and on iPadOS, no push).
  spa_rewrite_rules = [{
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webmanifest|webp)$)([^.]+$)/>"
    target = "/index.html"
    status = "200"
  }]

  # ── PWA response headers ─────────────────────────────────────────────────────────────────
  # Both consoles are PWAs (shop-web since 059, back-office since 2026-10-25); both pass these.
  pwa_headers = [
    {
      # The service worker decides when every other asset is refreshed, so it is the one file that
      # must never be served stale. Browsers already cap SW script caching at 24h; this states it.
      pattern = "/sw.js"
      headers = {
        "Cache-Control" = "no-store, max-age=0"
      }
    },
    {
      # Revalidate rather than no-store: the manifest changes rarely, but a changed icon or name
      # sitting behind a long cache is invisible until someone reinstalls.
      pattern = "/manifest.webmanifest"
      headers = {
        "Cache-Control" = "no-cache"
      }
    },
  ]

  # ── Per-console VITE_* env (build-time, inlined by Vite, all public-safe - contracts/config.contract.md)
  # Principle IV: shop-web must take the shop pool, back-office the admin pool. A swap makes sign-in
  # succeed and every backend call 401 from the mismatched authorizer.
  # PostHog is shared across the consoles; the project key is public-safe (build-inlined), same
  # source as the SSM record so one dev.tfvars value fans out to SSM + both console builds.
  telemetry_env = {
    VITE_POSTHOG_KEY       = var.posthog_project_key
    VITE_POSTHOG_HOST      = var.posthog_host
    VITE_TELEMETRY_ENABLED = var.telemetry_enabled ? "true" : "false"
  }

  shop_web_env = merge({
    VITE_COGNITO_USER_POOL_ID = module.shop_pool.user_pool_id
    VITE_COGNITO_CLIENT_ID    = module.shop_pool.app_client_id
    VITE_API_BASE_URL         = local.shop_web_api_base_url

    # Web push: all five are public (they identify the Firebase project; the FCM service account stays in
    # Secrets Manager for the notifications worker). Operator-supplied with no defaults, so `terraform plan`
    # refuses without them: without VITE_VAPID_PUBLIC_KEY, `getToken` never resolves and notifications look
    # enabled on a tablet that never rings.
    VITE_FIREBASE_API_KEY = var.firebase_api_key
    # 050's variable, not a new one. The console's web app and the notifications worker's service
    # account are the same Firebase project by definition; two variables naming it is how they drift.
    VITE_FIREBASE_PROJECT_ID          = var.fcm_project_id
    VITE_FIREBASE_APP_ID              = var.firebase_app_id
    VITE_FIREBASE_MESSAGING_SENDER_ID = var.firebase_messaging_sender_id
    VITE_VAPID_PUBLIC_KEY             = var.firebase_vapid_public_key
  }, local.telemetry_env)

  back_office_env = merge({
    VITE_COGNITO_USER_POOL_ID = module.back_office_pool.user_pool_id
    VITE_COGNITO_CLIENT_ID    = module.back_office_pool.app_client_id
    VITE_API_BASE_URL         = local.back_office_api_base_url
  }, local.telemetry_env)
}

# ── Shop operator console → shop.dev.effyshopping.com ──────────────────────────────────────────
module "amplify_shop_web" {
  source = "../../modules/amplify-web-app"

  name           = "${module.shared.name_prefix}-shop-web"
  repository_url = var.amplify_repository_url
  access_token   = data.aws_ssm_parameter.amplify_github_token.value

  deploy_branch = var.amplify_deploy_branch
  app_root      = "apps/shop-web"
  platform      = "WEB" # static SPA - NO service role (research D2)
  framework     = "Web"
  stage         = "DEVELOPMENT"

  env_vars       = local.shop_web_env
  custom_rules   = local.spa_rewrite_rules
  custom_headers = local.pwa_headers

  # service_role_arn unused for WEB (the module ignores it and sets iam_service_role_arn = null).

  # Two-stage cutover: empty domain = stage A (Amplify default hostname). Stage B attaches the subdomain.
  domain_name      = var.amplify_consoles_domain_enabled ? module.dns.zone_name : ""
  subdomain_prefix = var.shop_web_subdomain
  enable_www       = false
}

# ── Back-office admin console → back-office.dev.effyshopping.com ────────────────────────────────
module "amplify_back_office" {
  source = "../../modules/amplify-web-app"

  name           = "${module.shared.name_prefix}-back-office"
  repository_url = var.amplify_repository_url
  access_token   = data.aws_ssm_parameter.amplify_github_token.value

  deploy_branch = var.amplify_deploy_branch
  app_root      = "apps/back-office"
  platform      = "WEB"
  framework     = "Web"
  stage         = "DEVELOPMENT"

  env_vars       = local.back_office_env
  custom_rules   = local.spa_rewrite_rules
  custom_headers = local.pwa_headers

  domain_name      = var.amplify_consoles_domain_enabled ? module.dns.zone_name : ""
  subdomain_prefix = var.back_office_subdomain
  enable_www       = false
}

# Build-failure notification: one EventBridge rule for both consoles → the alerts topic (its policy in
# amplify-customer-web.tf already lets events.amazonaws.com publish). Amplify keeps the last good build live.
resource "aws_cloudwatch_event_rule" "consoles_build_failed" {
  name        = "${module.shared.name_prefix}-consoles-build-failed"
  description = "Amplify deployment FAILED for a shop-web or back-office console build - the pipeline is broken; the last good version is still live."

  event_pattern = jsonencode({
    source        = ["aws.amplify"]
    "detail-type" = ["Amplify Deployment Status Change"]
    detail = {
      appId     = [module.amplify_shop_web.app_id, module.amplify_back_office.app_id]
      jobStatus = ["FAILED"]
    }
  })
}

resource "aws_cloudwatch_event_target" "consoles_build_failed_to_sns" {
  rule      = aws_cloudwatch_event_rule.consoles_build_failed.name
  target_id = "alerts"
  arn       = aws_sns_topic.alerts.arn
}

# ── Outputs (contracts/config.contract.md § Outputs) ───────────────────────────────────────────
output "shop_web_app_id" {
  description = "Amplify app id for the shop operator console."
  value       = module.amplify_shop_web.app_id
}

output "shop_web_url" {
  description = "The shop console URL (Amplify default hostname pre-cutover; shop.dev.effyshopping.com after)."
  value       = module.amplify_shop_web.storefront_url
}

output "back_office_app_id" {
  description = "Amplify app id for the back-office admin console."
  value       = module.amplify_back_office.app_id
}

output "back_office_url" {
  description = "The back-office console URL (Amplify default hostname pre-cutover; back-office.dev.effyshopping.com after)."
  value       = module.amplify_back_office.storefront_url
}
