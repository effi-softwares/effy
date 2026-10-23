terraform {
  backend "s3" {
    # Same bootstrap bucket as every env root (infra/bootstrap). Backends cannot use
    # variables — this name is the literal contract.
    bucket = "effy-apse2-tfstate"

    # not under envs/ — this root is platform-wide, not an environment.
    key = "global/terraform.tfstate"

    region = "ap-southeast-2"

    # S3-native lockfile (Terraform >= 1.11) — no DynamoDB lock table.
    use_lockfile = true

    encrypt = true
  }
}
