# Writes one audience's auth contract values to SSM Parameter Store — the runtime
# app↔infra contract (research.md D10). Infra writes; backends/clients read by key.
# Renaming a key is a BREAKING change to every consumer
# (specs/001-infra-foundation/contracts/ssm-parameters.contract.md).

locals {
  prefix = "/effy/${var.env}/auth/${var.audience}"

  # Pool/client ids and ARNs are NOT secrets → String, no KMS.
  parameters = {
    user_pool_id  = var.user_pool_id
    app_client_id = var.app_client_id
    user_pool_arn = var.user_pool_arn
  }
}

resource "aws_ssm_parameter" "auth" {
  for_each = local.parameters

  name  = "${local.prefix}/${each.key}"
  type  = "String"
  value = each.value
  tier  = "Standard"

  tags = var.tags
}
