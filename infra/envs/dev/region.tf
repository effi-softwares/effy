# Region contract value: /effy/<env>/region - clients/backends read the env's home
# region from SSM instead of hardcoding it (ssm-parameters.contract.md). The value is
# var.aws_region, never a literal: region is config, not structure.

resource "aws_ssm_parameter" "region" {
  name  = "/effy/${var.env}/region"
  type  = "String"
  value = var.aws_region
  tier  = "Standard"
}
