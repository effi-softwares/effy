# Shared naming and base-tag locals for every env root: a resource-less module each env root calls with its
# `env`, wiring `tags` into the provider's `default_tags` and `name_prefix` into module names. Modules never
# call it.

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

  # Base tags applied to every resource via provider default_tags.
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
