# Shared naming + base tags (envs/_shared - the single source of truth, research.md D9).
module "shared" {
  source = "../_shared"
  env    = var.env
}

provider "aws" {
  # The only placement knob - relocating this env is a tfvars change (research.md D7).
  region = var.aws_region

  # Wrong-account guard (research.md D8): if the resolved `ef` credentials point at a
  # different account, Terraform errors before touching anything.
  allowed_account_ids = [var.aws_account_id]

  # Uniform tagging on every resource.
  default_tags {
    tags = module.shared.base_tags
  }
}

# ── 086 - us-east-1, for the two things CloudFront allows nowhere else ─────────────────────────
#
# the one region literal this root permits (claude.md, Decisions locked): a certificate behind
# CloudFront must live in us-east-1, and CloudFront publishes its metrics only there - so its alarms,
# and the topic they notify, live there too (media.tf). Everything else stays on var.aws_region.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = module.shared.base_tags
  }
}
