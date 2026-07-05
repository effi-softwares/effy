# One-time bootstrap: the hardened S3 bucket that holds ALL environments' Terraform
# state (one bucket, one key per env — research.md D2). Locking is the S3-native
# lockfile (`use_lockfile = true` in each env's backend.tf); there is NO DynamoDB table.

provider "aws" {
  region = var.aws_region

  # Wrong-account guard (research.md D8): if the resolved `ef` credentials point at a
  # different account, Terraform errors before touching anything.
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project     = "effy"
      Environment = "global"
      ManagedBy   = "terraform"
      Slice       = "001-infra-foundation"
      Owner       = "platform"
    }
  }
}

resource "aws_s3_bucket" "tfstate" {
  bucket = var.state_bucket_name

  lifecycle {
    # The state bucket must never be destroyed by a plan (data-model.md E2).
    prevent_destroy = true
  }
}

# Versioning: every state write is recoverable (rollback/safety).
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Default server-side encryption at rest. SSE-S3 is the sanctioned choice for this bucket
# (research.md D2 / data-model.md E2: "SSE-S3 or SSE-KMS") — state holds no secrets beyond
# resource ids, and a CMK would add KMS cost/IAM surface with no requirement behind it.
#trivy:ignore:avd-aws-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# No public access, under any account-level misconfiguration.
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Deny any non-TLS access to state.
resource "aws_s3_bucket_policy" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  # Bucket policies and public-access blocks race if created concurrently.
  depends_on = [aws_s3_bucket_public_access_block.tfstate]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.tfstate.arn,
          "${aws_s3_bucket.tfstate.arn}/*",
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })
}
