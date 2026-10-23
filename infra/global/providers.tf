# This root is platform-wide, not an environment.
#
# It deliberately does not call../envs/_shared: that module validates env ∈ {dev,qa,staging,prod}
# and "global" is none of them. The naming/tagging is inlined here instead.

provider "aws" {
  region = var.aws_region

  # Same wrong-account guard as every env root.
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
