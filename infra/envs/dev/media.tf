# Product-media bucket (016-shop-product-catalog, research R9).
#
# A private S3 bucket holding product images. The shop Lambda mints presigned PUT urls (browser /
# mobile upload bytes DIRECTLY to S3 — bytes never pass through Lambda) and presigned GET urls for
# reads. The bucket is PRIVATE in dev; a public CloudFront CDN is deferred to the customer-facing
# slice (only operators read these today, via presigned GET). The bucket name is published to SSM so
# the serverless shop service reads it as ${ssm:/effy/<env>/media/bucket} — region is var.aws_region,
# never a literal.

resource "aws_s3_bucket" "product_media" {
  bucket = "${module.shared.name_prefix}-product-media"
}

# No public access under any account-level misconfiguration — reads are via presigned GET only.
resource "aws_s3_bucket_public_access_block" "product_media" {
  bucket = aws_s3_bucket.product_media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# SSE-S3 at rest — product images hold no secrets; a CMK would add KMS cost/IAM surface with no
# requirement behind it (same rationale as the state bucket).
#trivy:ignore:avd-aws-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "product_media" {
  bucket = aws_s3_bucket.product_media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Versioning — an overwritten/deleted image stays recoverable.
resource "aws_s3_bucket_versioning" "product_media" {
  bucket = aws_s3_bucket.product_media.id

  versioning_configuration {
    status = "Enabled"
  }
}

# CORS: the browser (shop-web, back-office) PUTs bytes DIRECTLY to S3 via the presigned url, so the
# bucket itself must allow the cross-origin PUT/GET — the edge API's CORS says nothing about S3.
#
# ⚠ THE ORIGINS ARE local.browser_origins (edge-gateway.tf), THE SAME LIST THE GATEWAY USES, and
# that is the fix for a real defect: this rule was localhost-only, so on the DEPLOYED consoles
# (048) every API call succeeded and only the direct-to-S3 upload failed, at a pre-flight, with no
# error reaching any server, log or alarm — the operator sees a browser CORS message and the
# platform sees nothing at all. Restating the list here is what let the two drift; a new console
# origin is now one Terraform change in one place.
#
# Presigned GET is the same rule. Mobile (driver/shop apps) uploads natively and is not subject to
# CORS at all, so it is unaffected either way.
resource "aws_s3_bucket_cors_configuration" "product_media" {
  bucket = aws_s3_bucket.product_media.id

  cors_rule {
    allowed_methods = ["PUT", "GET"]
    allowed_origins = local.browser_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# Publish the bucket name so the shop service reads it from the SSM contract (never a literal).
resource "aws_ssm_parameter" "media_bucket" {
  name  = "/effy/${var.env}/media/bucket"
  type  = "String"
  value = aws_s3_bucket.product_media.bucket
  tier  = "Standard"
}

# ── 064 — delivery proof archival ───────────────────────────────────────────────────────────────
#
# ⚠ PROOF IS ARCHIVED, NEVER DELETED (operator direction, 2026-09-21). It is evidence: a photograph or
# a signature that answers "did this delivery happen?" long after everyone has forgotten. The rule
# below moves it to cheaper storage once the active dispute window has closed — a submitted refund can
# be rejected up to thirty days later (055) — and there is deliberately NO `expiration` block.
#
# ⚠ GLACIER_IR SPECIFICALLY, AND THE CHOICE IS LOAD-BEARING. Glacier Instant Retrieval serves a
# GetObject in MILLISECONDS through the ordinary S3 API, so the presigned GET the driver app and the
# back-office console already use keeps working untouched. GLACIER (Flexible) and DEEP_ARCHIVE both
# require an asynchronous RestoreObject and a wait of minutes or hours, which would fork every read
# path into "recent" and "archived" behaviour and add a restore-and-notify flow, polling, and a UI
# state for "your evidence is being retrieved".
#
# The saving does not justify it. A proof image is ~200 KB; at 500 deliveries a day that is ~36 GB a
# year, which GLACIER_IR holds for about $0.15/month per year accumulated. DEEP_ARCHIVE would save
# roughly $0.11/month and cost an entire asynchronous retrieval subsystem. Archiving this way costs
# ZERO CODE — the storage class changes underneath and nothing above it can tell.
#
# ⚠⚠ THE PREFIX FILTER IS NOT COSMETIC. This bucket is shared: `products/` holds the live catalogue
# and `promotions/` holds banner artwork. An unscoped rule would push every product image into an
# archive tier, where the storefront would still render perfectly and silently bill a retrieval fee on
# EVERY PAGE VIEW. `PROOF_MEDIA_PREFIX` in @effy/edge-shared is the same value, and
# `proof-prefix.guard.test.ts` reads this file to prove the two agree.
#
# ⚠ A NEAR-MISS WORTH RECORDING. While retention was still time-limited this was going to be an
# `expiration` — and versioning is ENABLED on this bucket (above), where `expiration` does not delete
# anything: it writes a delete marker and the object version persists indefinitely. The platform would
# have reported every photograph deleted while all of them remained in S3, and it would have passed
# `terraform validate`, applied cleanly, and shown the right thing in every console and test. 058's
# `WriteTimeout` and 024's VectorDrawable are the same shape: valid, applies, wrong only where it runs.
resource "aws_s3_bucket_lifecycle_configuration" "product_media" {
  bucket = aws_s3_bucket.product_media.id

  rule {
    id     = "proof-archive"
    status = "Enabled"

    filter {
      prefix = "proof/"
    }

    transition {
      days          = 90
      storage_class = "GLACIER_IR"
    }

    # Versioning is on, so an overwritten object leaves a noncurrent version behind. Proof keys carry
    # a random token and are never reused, so this should match nothing — it exists so that if one
    # ever does appear it is archived with everything else rather than sitting in STANDARD unnoticed.
    noncurrent_version_transition {
      noncurrent_days = 90
      storage_class   = "GLACIER_IR"
    }

    # An upload the driver's phone abandoned mid-flight is billable storage nothing will ever read.
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}
