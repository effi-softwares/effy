variable "aws_region" {
  description = "Region the state bucket lives in. Independent of any env's aws_region — state stays put even if an env relocates."
  type        = string
  default     = "ap-southeast-2"
}

variable "aws_account_id" {
  description = "The target AWS account id (12 digits). Pinned via allowed_account_ids so a misdirected apply fails loudly."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be the 12-digit AWS account id — set the real value in infra/bootstrap/terraform.tfvars."
  }
}

variable "state_bucket_name" {
  description = "Globally-unique name of the S3 state bucket. If taken, override here AND update every infra/envs/*/backend.tf (breaking change to the backend contract)."
  type        = string
  default     = "effy-apse2-tfstate"
}
