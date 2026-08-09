# The storefront's own contract (042) — its public address, and the bearer the back office presents
# when it needs the storefront to drop a cached page.
#
# ⚠ THIS EXISTS BECAUSE PUBLISHING A HOME PAGE HAS TWO HALVES AND ONLY ONE OF THEM IS A DATABASE
# WRITE. The storefront reads its published layout through a cached path so the public home page can
# still prerender as a static shell; nothing about that read notices a publish. Without these two
# values the back office cannot tell it, and an operator would change the page, be told it succeeded,
# and watch shoppers keep seeing the old one for up to an hour — with no error anywhere.
#
# The edge-api admin service resolves both at DEPLOY time (`serverless.yml`), so a missing parameter
# fails the deploy rather than the request. That is the intended order: a service that cannot
# invalidate the storefront's cache should not reach production quietly.

# ── The storefront's public address ─────────────────────────────────────────────────────────────
#
# ⚠ Also read by 039's newsletter double opt-in, which composes its confirmation link from it. That
# feature currently has no value to read and its confirm link points at localhost — this parameter
# closes that gap as a side effect, which is worth knowing before anyone changes its shape.
resource "aws_ssm_parameter" "web_site_url" {
  name        = "/effy/${var.env}/web/site_url"
  description = "Public origin of the customer storefront. Read by the admin service (042 cache invalidation) and by the newsletter confirm link (039)."
  type        = "String"
  value       = var.storefront_base_url
  tier        = "Standard"
}

# ── The revalidation bearer ─────────────────────────────────────────────────────────────────────
#
# ⚠ A SHARED SECRET, NOT AN IAM CALL, because the two ends are not both in AWS's identity world: the
# caller is a Lambda and the callee is a Next.js route handler on Amplify Hosting, reachable from the
# public internet. An unauthenticated endpoint there is a free cache-flush primitive against the
# platform's only public surface — every request afterwards paying a Sydney round trip.
#
# ⚠ TERRAFORM CREATES THE CONTAINER AND NEVER THE VALUE — the 035 `otp_hmac` precedent, followed
# rather than quietly reversed. A `random_password` here would write the credential into Terraform
# state, and state is a file several people and a CI role can read; worse, it would mean nobody ever
# consciously chose it (constitution: a real-world credential is asked for, never inferred).
#
# The operator seeds it once, per environment:
#
#   aws secretsmanager put-secret-value --region ap-southeast-2 \
#     --secret-id effy-dev-web-revalidate \
#     --secret-string "$(openssl rand -base64 48)"
#
# ⚠ Until it is seeded, PUBLISHING FAILS LOUDLY rather than half-working: the admin service cannot
# read the bearer, the storefront is never told, and the operator is told so in the same response
# (`revalidation_failed`). That is the right failure — the wrong one would be a publish that reports
# success while shoppers keep seeing the old page.
resource "aws_secretsmanager_secret" "revalidate" {
  name        = "${module.shared.name_prefix}-web-revalidate"
  description = "042 — bearer the back office presents to the storefront's /api/revalidate route. Seeded by the operator, never by Terraform."

  # ⚠ Zero, deliberately. A deleted secret name is unusable for the recovery window, so the default
  # 30 days would make a mistaken destroy-and-recreate a month-long outage of the publish path.
  recovery_window_in_days = 0
}

resource "aws_ssm_parameter" "web_revalidate_secret_arn" {
  name        = "/effy/${var.env}/web/revalidate_secret_arn"
  description = "ARN of the storefront revalidation bearer. The admin service reads the VALUE at runtime; only the ARN is ever in an env var."
  type        = "String"
  value       = aws_secretsmanager_secret.revalidate.arn
  tier        = "Standard"
}

output "web_site_url" {
  description = "Public origin of the storefront, as the platform's services will resolve it."
  # ⚠ The VARIABLE, not `aws_ssm_parameter.….value`. The provider marks every parameter value
  # sensitive regardless of its tier, so referencing it makes this output sensitive too and Terraform
  # refuses to plan. The address is public by definition — it is what shoppers type.
  value = var.storefront_base_url
}

output "web_revalidate_secret_arn" {
  description = "⚠ SEED THIS SECRET, then give the storefront the same VALUE as its REVALIDATE_SECRET env var. The two ends must match or every publish reports a refresh failure."
  value       = aws_secretsmanager_secret.revalidate.arn
}
