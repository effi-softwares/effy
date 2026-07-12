# This root is PLATFORM-WIDE, not an environment.
#
# It deliberately does NOT call ../envs/_shared: that module validates env ∈ {dev,qa,staging,prod}
# and "global" is none of them. The naming/tagging is inlined here instead (010 research R1).

provider "aws" {
  region = var.aws_region

  # Same wrong-account guard as every env root (001 research D8).
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project     = "effy"
      Environment = "global"
      ManagedBy   = "terraform"
      Slice       = "010-domain-dns-foundation"
      Owner       = "platform"
    }
  }
}
