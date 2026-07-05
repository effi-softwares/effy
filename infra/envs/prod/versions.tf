terraform {
  # >= 1.11: S3-native state locking (use_lockfile) is GA — research.md D2.
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
