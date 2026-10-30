# The media bucket: private. The shop service mints presigned PUT URLs (clients upload straight to S3) and
# presigned GET URLs for operator reads; its name is published as ${ssm:/effy/<env>/media/bucket}. Shopper
# pictures are served by the CDN at the bottom of this file (media.<zone>), reading only
# local.public_media_prefixes through Origin Access Control; labels and proof stay presigned-only.

resource "aws_s3_bucket" "product_media" {
  bucket = "${module.shared.name_prefix}-product-media"
}

# No public access under any account-level misconfiguration - reads are via presigned GET only.
resource "aws_s3_bucket_public_access_block" "product_media" {
  bucket = aws_s3_bucket.product_media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# SSE-S3 at rest - product images hold no secrets; a CMK would add KMS cost/IAM surface with no
# requirement behind it (same rationale as the state bucket).
# trivy:ignore:avd-aws-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "product_media" {
  bucket = aws_s3_bucket.product_media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Versioning - an overwritten/deleted image stays recoverable.
resource "aws_s3_bucket_versioning" "product_media" {
  bucket = aws_s3_bucket.product_media.id

  versioning_configuration {
    status = "Enabled"
  }
}

# CORS: the consoles PUT bytes straight to S3, so the bucket must allow the cross-origin PUT/GET. The origins
# are local.browser_origins (edge-gateway.tf), the gateway's own list, so a new console origin is one change
# (restated, they diverged once and only uploads failed). Native mobile uploads are not subject to CORS.
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

# Delivery proof is archived, never deleted: it is evidence. It moves to GLACIER_IR once the dispute window
# has closed (a refund can be decided up to thirty days later), with no `expiration` block (on this
# versioned bucket an expiration only writes a delete marker).
#
# GLACIER_IR because it serves GetObject in milliseconds through the ordinary API, so the existing presigned
# reads keep working; Flexible and DEEP_ARCHIVE need an asynchronous restore. At ~200 KB a proof, the
# saving of a deeper tier is cents a month.
#
# The prefix filter matters: the bucket also holds `products/` and `promotions/`, which an unscoped rule
# would archive and then bill a retrieval on every page view. `PROOF_MEDIA_PREFIX` in @effy/edge-shared is
# the same value; `proof-prefix.guard.test.ts` reads this file to prove it.
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
    # a random token and are never reused, so this should match nothing - it exists so that if one
    # ever does appear it is archived with everything else rather than sitting in standard unnoticed.
    noncurrent_version_transition {
      noncurrent_days = 90
      storage_class   = "GLACIER_IR"
    }

    # An upload the driver's phone abandoned mid-flight is billable storage nothing will ever read.
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # 102 - pictures fetched for a product import wait under imports/ until the products are created, when
  # they are copied to products/. A staged copy is never read again after that, so it goes after a week;
  # on this versioned bucket the expiration writes a delete marker and the old version goes a day later.
  rule {
    id     = "import-staging-expiry"
    status = "Enabled"

    filter {
      prefix = "imports/"
    }

    expiration {
      days = 7
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }
}

# ══ 086 - shopper pictures: one permanent public address, smaller copies made at upload ══════════
#
# Spec specs/086-catalogue-image-delivery; decisions in its research.md.

# the public set, stated in terraform. `PUBLIC_MEDIA_PREFIXES` in @effy/edge-shared
# (media-public.ts) is the same list, and media-public.guard.test.ts reads this file to prove the two
# agree. Only these prefixes are readable through the CDN. `proof/` and `courier-label/` - a door
# photo, a customer's name and address - must never be added; the guard fails if they are.
locals {
  public_media_prefixes = ["products", "promotions", "categories", "renditions"]
  media_host            = "media.${module.dns.zone_name}"
}

# ── The certificate - us-east-1, because CloudFront reads certificates only there ────────────────
resource "aws_acm_certificate" "media" {
  provider          = aws.us_east_1
  domain_name       = local.media_host
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "media_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.media.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id         = module.dns.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "media" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.media.arn
  validation_record_fqdns = [for r in aws_route53_record.media_cert_validation : r.fqdn]
}

# ── The CDN ─────────────────────────────────────────────────────────────────────────────────────
resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${module.shared.name_prefix}-media"
  description                       = "086 - the media CDN reads the private product-media bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# A year at the edge, keyed on the path alone. Keys are random and never reused (a replaced picture
# has a new key), so nothing cached here can ever be stale.
resource "aws_cloudfront_cache_policy" "media" {
  name        = "${module.shared.name_prefix}-media"
  comment     = "086 - immutable picture keys: cache a year, path only"
  default_ttl = 31536000
  max_ttl     = 31536000
  min_ttl     = 86400

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    # Pictures are already compressed formats.
    enable_accept_encoding_gzip   = false
    enable_accept_encoding_brotli = false
  }
}

# the browser's year. Pictures reach S3 through presigned PUTs that set no Cache-Control, so it is
# set here rather than on every object. It may also be stamped on a 403; no page names a picture
# that is not there, and research R3 records the check and the fix if that ever matters.
resource "aws_cloudfront_response_headers_policy" "media" {
  name    = "${module.shared.name_prefix}-media"
  comment = "086 - pictures are immutable: browsers keep them a year"

  custom_headers_config {
    items {
      header   = "Cache-Control"
      value    = "public, max-age=31536000, immutable"
      override = true
    }
  }

  cors_config {
    access_control_allow_credentials = false
    access_control_allow_headers {
      items = ["*"]
    }
    access_control_allow_methods {
      items = ["GET", "HEAD"]
    }
    access_control_allow_origins {
      items = ["*"]
    }
    origin_override = true
  }
}

# no access logging in dev: the bucket's own reads are not audited either
# trivy:ignore:avd-aws-0010
# no WAF: static, public, immutable files with no write path
# trivy:ignore:avd-aws-0011
resource "aws_cloudfront_distribution" "media" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${module.shared.name_prefix} shopper pictures (086)"
  aliases         = [local.media_host]
  # all, not 100/200: Australian and New Zealand edges are only in "All". The cheaper classes would
  # serve a Sydney shopper from Asia or North America.
  price_class  = "PriceClass_All"
  http_version = "http2and3"

  origin {
    origin_id                = "media-bucket"
    domain_name              = aws_s3_bucket.product_media.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id           = "media-bucket"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = false
    cache_policy_id            = aws_cloudfront_cache_policy.media.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.media.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.media.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Slice = "086-catalogue-image-delivery"
  }
}

resource "aws_route53_record" "media_a" {
  zone_id = module.dns.zone_id
  name    = local.media_host
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.media.domain_name
    zone_id                = aws_cloudfront_distribution.media.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "media_aaaa" {
  zone_id = module.dns.zone_id
  name    = local.media_host
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.media.domain_name
    zone_id                = aws_cloudfront_distribution.media.hosted_zone_id
    evaluate_target_health = false
  }
}

# ── The bucket policy - the CDN reads the public set and nothing else ───────────────────────────
#
# NO s3:ListBucket, deliberately. Without it S3 answers 403 for a key that is not there exactly as
# it answers a key the policy refuses: a request cannot learn whether a label exists, and
# nothing can be listed. The public-access block above stays fully on - OAC is not public
# access. This is the bucket's only policy resource; a second would silently replace it.
data "aws_iam_policy_document" "product_media" {
  statement {
    sid       = "CdnReadsPublicPicturesOnly"
    actions   = ["s3:GetObject"]
    resources = [for p in local.public_media_prefixes : "${aws_s3_bucket.product_media.arn}/${p}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.media.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "product_media" {
  bucket = aws_s3_bucket.product_media.id
  policy = data.aws_iam_policy_document.product_media.json

  depends_on = [aws_s3_bucket_public_access_block.product_media]
}

resource "aws_ssm_parameter" "media_public_base_url" {
  name  = "/effy/${var.env}/media/public_base_url"
  type  = "String"
  value = "https://${local.media_host}"
  tier  = "Standard"
}

# ── The rendition queue - the bucket says a picture arrived; the media worker makes its copies ─────
#
# only products/, promotions/ and categories/ (101) are notified. The worker writes under renditions/, which is never
# notified - so it cannot trigger itself - and proof/ and courier-label/ are never sent to it at all.
# sse-SQS below; a CMK adds cost and IAM surface with no requirement behind it
# trivy:ignore:avd-aws-0096
resource "aws_sqs_queue" "media_renditions_dlq" {
  name                      = "${module.shared.name_prefix}-media-renditions-dlq"
  message_retention_seconds = 1209600 # 14 days to look at what failed
  sqs_managed_sse_enabled   = true
}

# as above
# trivy:ignore:avd-aws-0096
resource "aws_sqs_queue" "media_renditions" {
  name                       = "${module.shared.name_prefix}-media-renditions"
  visibility_timeout_seconds = 360 # six times the render function's 60 s timeout
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.media_renditions_dlq.arn
    maxReceiveCount     = 3
  })
}

data "aws_iam_policy_document" "media_renditions_queue" {
  statement {
    sid       = "BucketNotifiesUploads"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.media_renditions.arn]

    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_s3_bucket.product_media.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.aws_account_id]
    }
  }
}

resource "aws_sqs_queue_policy" "media_renditions" {
  queue_url = aws_sqs_queue.media_renditions.id
  policy    = data.aws_iam_policy_document.media_renditions_queue.json
}

# This is the bucket's only notification resource; a second would silently replace it.
resource "aws_s3_bucket_notification" "product_media" {
  bucket = aws_s3_bucket.product_media.id

  queue {
    id            = "renditions-products"
    queue_arn     = aws_sqs_queue.media_renditions.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "products/"
  }

  queue {
    id            = "renditions-promotions"
    queue_arn     = aws_sqs_queue.media_renditions.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "promotions/"
  }

  queue {
    id            = "renditions-categories"
    queue_arn     = aws_sqs_queue.media_renditions.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "categories/"
  }

  depends_on = [aws_sqs_queue_policy.media_renditions]
}

resource "aws_ssm_parameter" "media_rendition_queue_arn" {
  name  = "/effy/${var.env}/media/rendition_queue_arn"
  type  = "String"
  value = aws_sqs_queue.media_renditions.arn
  tier  = "Standard"
}

# ── Alarms - regional, to the operator alerts topic ────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "media_renditions_dlq" {
  alarm_name          = "${module.shared.name_prefix}-media-renditions-dlq"
  alarm_description   = "086 - an uploaded picture could not be processed after three tries (S3 or the database failing, not a bad picture). Shoppers get the full-size original until it is. Read /aws/lambda/effy-edge-media-${var.env}-render, fix the cause, then redrive the dead-letter queue ${aws_sqs_queue.media_renditions_dlq.name}."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.media_renditions_dlq.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# The worker's own errors - a thrown fault (S3, the database, a bad deploy) rather than a bad picture.
# Here, not in background-functions.tf: that map is for scheduled functions, and this one is fed by
# the queue. Three errors in each of three five-minute periods: one cold connection is not news.
resource "aws_cloudwatch_metric_alarm" "media_render_errors" {
  alarm_name          = "${module.shared.name_prefix}-media-render-errors"
  alarm_description   = "086 - the picture worker keeps failing: uploaded pictures are not being made smaller, and shoppers get full-size originals. Read /aws/lambda/effy-edge-media-${var.env}-render. (Expected while the database is stopped.)"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = "effy-edge-media-${var.env}-render" }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 3
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# one failure is enough. A picture the worker cannot read is rare, and each one is a
# named picture shoppers see at full size until someone replaces it.
resource "aws_cloudwatch_metric_alarm" "media_rendition_failed" {
  alarm_name          = "${module.shared.name_prefix}-media-rendition-failed"
  alarm_description   = "086 - a picture could not be made smaller (corrupt, unsupported or too large). Shoppers see the original. Find it: SELECT storage_key, failure FROM public.media_rendition WHERE status = 'failed' ORDER BY rendered_at DESC; then ask its shop (or staff, for promotion artwork) for a new upload."
  namespace           = "Effy/Media"
  metric_name         = "RenditionFailed"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# ── CDN alarms - us-east-1, the only region CloudFront publishes metrics in ──────────────
#
# A second alerts topic, because an alarm can notify only a topic in its own region. Its
# subscription takes the same var.alert_email as alerts.tf, behind the same guard - never a retyped
# address - and AWS mails one more confirmation link the operator must click.
# Unencrypted on purpose: CloudWatch alarms cannot publish to a topic under the AWS-managed SNS key,
# and a customer key would cost more than the alarm text it protects (no customer data in it).
# trivy:ignore:avd-aws-0095
resource "aws_sns_topic" "alerts_us_east_1" {
  provider = aws.us_east_1
  name     = "${module.shared.name_prefix}-alerts-us-east-1"
}

resource "aws_sns_topic_subscription" "alerts_us_east_1_email" {
  provider = aws.us_east_1
  count    = var.alert_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.alerts_us_east_1.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "media_cdn_5xx" {
  provider            = aws.us_east_1
  alarm_name          = "${module.shared.name_prefix}-media-cdn-5xx"
  alarm_description   = "086 - the picture CDN (${local.media_host}) is failing to serve pictures: shoppers see empty frames. Check the bucket policy and the distribution in the CloudFront console."
  namespace           = "AWS/CloudFront"
  metric_name         = "5xxErrorRate"
  dimensions          = { DistributionId = aws_cloudfront_distribution.media.id, Region = "Global" }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts_us_east_1.arn]
}

resource "aws_cloudwatch_metric_alarm" "media_cdn_4xx" {
  provider            = aws.us_east_1
  alarm_name          = "${module.shared.name_prefix}-media-cdn-4xx"
  alarm_description   = "086 - more than one picture request in ten is refused by the CDN (${local.media_host}): pages are naming pictures that are not there, or the bucket policy no longer covers a public prefix. Shoppers see empty frames."
  namespace           = "AWS/CloudFront"
  metric_name         = "4xxErrorRate"
  dimensions          = { DistributionId = aws_cloudfront_distribution.media.id, Region = "Global" }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 10
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts_us_east_1.arn]
}
