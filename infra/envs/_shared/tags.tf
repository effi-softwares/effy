# Shared naming + base-tags locals (research.md D9) — the single source of truth for
# resource naming and tagging across every env root.
#
# This is a tiny, resource-less module: each env root calls it with its `env` and wires
# `tags` into the provider `default_tags` block and `name_prefix` into module names.
# Modules never call it (composition happens only in env roots — ARCHITECTURE.md).

variable "env" {
  description = "Environment name (dev | qa | staging | prod)."
  type        = string

  validation {
    condition     = contains(["dev", "qa", "staging", "prod"], var.env)
    error_message = "env must be one of: dev, qa, staging, prod."
  }
}

locals {
  # Name prefix: effy-<env>-<concern> (e.g. effy-dev-customer).
  name_prefix = "effy-${var.env}"

  # Base tags applied to every resource via provider default_tags (spec FR-021, SC-009).
  base_tags = {
    Project     = "effy"
    Environment = var.env
    ManagedBy   = "terraform"
    Slice       = "001-infra-foundation"
    Owner       = "platform"
  }
}

output "name_prefix" {
  description = "Resource name prefix: effy-<env>."
  value       = local.name_prefix
}

output "base_tags" {
  description = "Base tag map for the provider default_tags block."
  value       = local.base_tags
}
