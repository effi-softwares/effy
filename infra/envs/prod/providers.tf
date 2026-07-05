# Shared naming + base tags (envs/_shared — the single source of truth, research.md D9).
module "shared" {
  source = "../_shared"
  env    = var.env
}

provider "aws" {
  # The ONLY placement knob — relocating this env is a tfvars change (research.md D7).
  region = var.aws_region

  # Wrong-account guard (research.md D8): if the resolved `ef` credentials point at a
  # different account, Terraform errors before touching anything.
  allowed_account_ids = [var.aws_account_id]

  # Uniform tagging on every resource (FR-021, SC-009).
  default_tags {
    tags = module.shared.base_tags
  }
}
