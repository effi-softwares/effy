# Bootstrap inputs — auto-loaded by terraform. Fill in the real account id before
# `make bootstrap-apply` (the aws_account_id validation fails loudly until you do).
aws_region     = "ap-southeast-2"
aws_account_id = "724289623101"

# Must be globally unique across all of S3. If the default is taken, change it here
# AND in every infra/envs/*/backend.tf `bucket = ...` line.
state_bucket_name = "effy-apse2-tfstate"
