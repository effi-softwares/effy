terraform {
  backend "s3" {
    # Same bootstrap bucket as every env root (infra/bootstrap). Backends cannot use
    # variables — this name is the literal contract.
    bucket = "effy-apse2-tfstate"

    # NOT under envs/ — this root is platform-wide, not an environment (010 research R1).
    key = "global/terraform.tfstate"

    region = "ap-southeast-2"

    # S3-native lockfile (Terraform >= 1.11) — no DynamoDB lock table (001 research D2).
    use_lockfile = true

    encrypt = true
  }
}
