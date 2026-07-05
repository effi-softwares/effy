terraform {
  # >= 1.11: S3-native state locking (use_lockfile) is GA — research.md D2.
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Deliberately NO backend block: bootstrap runs on LOCAL state (the chicken-and-egg
  # solution, research.md D3). Its tfstate stays on the operator's machine and is
  # git-ignored; everything else stores state in the bucket this root creates.
}
