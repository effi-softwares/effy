# Internal console continuous deployment (048-console-web-cicd).
#
# Two Vite + React SPA consoles — shop-web (shop pool) and back-office (admin pool) — deployed via the
# same Amplify Hosting monorepo pipeline as the storefront (042), but STATIC (platform = "WEB", no SSR
# service role) and on SUBDOMAINS of this env's namespace (shop. / back-office.), never the apex. The
# repo-root amplify.yml declares one applications[] entry per surface; each Amplify app builds ONLY the
# entry matching its AMPLIFY_MONOREPO_APP_ROOT (contracts/amplify-build.contract.md) — the mechanical
# guarantee of FR-006/FR-009 that a console can never build another surface.
#
# ⚠ OPERATOR PREREQUISITE (out-of-code — constitution: Real-World Identifiers): the Amplify→GitHub
# connection token is REUSED from 042 (data.aws_ssm_parameter.amplify_github_token, declared in
# amplify-customer-web.tf). No new secret. The consoles carry NO secret at all — every VITE_* value is
# a public-safe pool id / client id / gateway address.

locals {
  # The deployed cold-path (edge) gateway origin — the same address 042 wires for the storefront's
  # cold path. Both consoles call it; shop-web on /shop/v1/*, back-office on /admin/v1/*.
  console_api_base_url = "https://${var.api_subdomain}.${module.dns.zone_name}" # https://edge-api.dev.effyshopping.com
  # ⚠ 057: the HOT path, and the shop console is the ONLY console that needs it. It calls exactly one
  # core-api route — issuing a refund, which must settle through 055's state machine because the
  # payment secret lives there and nowhere else. Derived from the same zone the service is served from,
  # never hand-typed: an origin that drifts fails only at a browser pre-flight, the hardest kind of
  # failure to recognise.
  core_api_base_url = "https://${var.core_api_subdomain}.${module.dns.zone_name}" # https://core-api.dev.effyshopping.com

  # ── SPA rewrite (research D3 / contracts § "SPA rewrite") ──────────────────────────────────────
  # Any path that is NOT a real static asset → /index.html with status 200 (a rewrite, not a redirect,
  # so deep-link URLs are preserved). The negative-lookahead keeps genuine assets serving directly.
  #
  # ⚠ `webmanifest` ADDED BY 059, AND ITS ABSENCE WAS A SILENT FAILURE. Without it the extension is
  # not in the allow-list, so `GET /manifest.webmanifest` matched the rewrite and returned the app
  # shell — HTML, with status 200. The browser then parses HTML as a manifest, finds nothing, and the
  # console is simply NOT INSTALLABLE: no error in the page, no error in the build, no failing test,
  # and nothing in any log. On iPadOS, where the Push API exists only for a home-screen app, that
  # would have taken notifications down with it.
  #
  # `js` and `json` were already listed, so the service worker and a `.json`-named manifest would
  # have worked by luck. Fixing the list rather than renaming the file, because the next console to
  # want a manifest would otherwise walk into the same trap.
  spa_rewrite_rules = [{
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webmanifest|webp)$)([^.]+$)/>"
    target = "/index.html"
    status = "200"
  }]

  # ── PWA response headers (059) ─────────────────────────────────────────────────────────────────
  # Shop-web only. back-office is not a PWA and passes nothing, so it stays byte-identical.
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

  # ── Per-console VITE_* env (build-time, inlined by Vite, all public-safe — contracts/config.contract.md)
  # ⚠ Principle IV: shop-web MUST take the SHOP pool, back-office the ADMIN pool. A swap makes sign-in
  # succeed and every backend call 401 from the mismatched authorizer.
  # 050 — PostHog is shared across the consoles; the project key is public-safe (build-inlined), same
  # source as the SSM record so one dev.tfvars value fans out to SSM + both console builds.
  telemetry_env = {
    VITE_POSTHOG_KEY       = var.posthog_project_key
    VITE_POSTHOG_HOST      = var.posthog_host
    VITE_TELEMETRY_ENABLED = var.telemetry_enabled ? "true" : "false"
  }

  shop_web_env = merge({
    VITE_COGNITO_USER_POOL_ID = module.shop_pool.user_pool_id
    VITE_COGNITO_CLIENT_ID    = module.shop_pool.app_client_id
    VITE_API_BASE_URL         = local.console_api_base_url
    # ⚠ 057 — REQUIRED by apps/shop-web's config contract. Without it the hosted build serves a console
    # that throws "Missing required config" on first render, not just on the refund path.
    VITE_CORE_API_BASE_URL = local.core_api_base_url

    # ── 059 web push ─────────────────────────────────────────────────────────────────────────────
    # ⚠ ALL FIVE ARE PUBLIC BY DESIGN. They identify the Firebase project; they do not authorise.
    # The secret half is the FCM service account, which lives in Secrets Manager and is read only by
    # the notifications worker — it must never reach a browser.
    #
    # ⚠ OPERATOR-SUPPLIED, NO DEFAULTS (constitution § Real-World Identifiers). The variables below
    # have no default and `terraform plan` refuses without them. That is deliberate for
    # VITE_VAPID_PUBLIC_KEY in particular: without it `getToken()` never resolves, so the operator
    # grants notification permission, sees the toggle turn on, and owns a tablet that will never
    # ring — nothing throws and nothing logs. A build that stops beats a value that silently works.
    VITE_FIREBASE_API_KEY = var.firebase_api_key
    # ⚠ 050's variable, not a new one. The console's web app and the notifications worker's service
    # account are the same Firebase project by definition; two variables naming it is how they drift.
    VITE_FIREBASE_PROJECT_ID          = var.fcm_project_id
    VITE_FIREBASE_APP_ID              = var.firebase_app_id
    VITE_FIREBASE_MESSAGING_SENDER_ID = var.firebase_messaging_sender_id
    VITE_VAPID_PUBLIC_KEY             = var.firebase_vapid_public_key
  }, local.telemetry_env)

  back_office_env = merge({
    VITE_COGNITO_USER_POOL_ID = module.back_office_pool.user_pool_id
    VITE_COGNITO_CLIENT_ID    = module.back_office_pool.app_client_id
    VITE_API_BASE_URL         = local.console_api_base_url

    # ⚠ 055: the back office is the ONLY console that talks to a second backend.
    #
    # Refunds are issued by core-api because the payment secret lives there and nowhere else
    # (019 SC-012). Reading an order still comes from the shared gateway above; only the money moves
    # through here. See 055 research R1 for why the alternatives — duplicating the secret into a
    # Lambda, or forwarding an operator's token between services — were both rejected.
    #
    # ⚠ This origin must ALSO be in core-api's CORS allowlist (`cors_allowed_origins`), or every
    # refund call fails at the pre-flight with an error that looks nothing like a permissions problem.
    VITE_CORE_API_BASE_URL = "https://${var.core_api_subdomain}.${module.dns.zone_name}"
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
  platform      = "WEB" # static SPA — NO service role (research D2)
  framework     = "Web"
  stage         = "DEVELOPMENT"

  env_vars     = local.shop_web_env
  custom_rules = local.spa_rewrite_rules
  # 059 — shop-web is the platform's only PWA. back-office passes nothing and stays byte-identical.
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

  env_vars     = local.back_office_env
  custom_rules = local.spa_rewrite_rules

  domain_name      = var.amplify_consoles_domain_enabled ? module.dns.zone_name : ""
  subdomain_prefix = var.back_office_subdomain
  enable_www       = false
}

# ── Build-failure notification (Principle VII, research D12) ────────────────────────────────────
#
# One EventBridge rule for BOTH consoles → the existing alerts SNS topic (037/042). The topic's policy
# (aws_sns_topic_policy.alerts in amplify-customer-web.tf) already grants events.amazonaws.com publish,
# so no new topic or policy is added. Amplify keeps the last good version live natively; this is the
# missing "someone is told" half (the detection-without-notification gap 037 fixed). (FR-023)
resource "aws_cloudwatch_event_rule" "consoles_build_failed" {
  name        = "${module.shared.name_prefix}-consoles-build-failed"
  description = "Amplify deployment FAILED for a shop-web or back-office console build — the pipeline is broken; the last good version is still live."

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
