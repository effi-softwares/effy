terraform {
  # >= 1.11 to match the platform's roots (S3-native state locking, etc.).
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
