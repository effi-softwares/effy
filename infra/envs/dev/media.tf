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
