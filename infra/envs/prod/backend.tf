terraform {
  backend "s3" {
    # The bootstrap bucket (infra/bootstrap). Backends cannot use variables — this name
    # is the literal contract; see infra/bootstrap/README.md before changing it.
    bucket = "effy-apse1-tfstate"

    # Per-env state isolation: one bucket, one key per env (FR-012).
    key = "envs/prod/terraform.tfstate"

    # Where the STATE bucket lives — independent of var.aws_region (resources can
    # relocate; state stays put).
    region = "ap-southeast-1"

    # S3-native lockfile (Terraform >= 1.11) — no DynamoDB lock table (research.md D2).
    use_lockfile = true

    encrypt = true
  }
}
